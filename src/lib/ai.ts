// OpenRouter API client.
// Server-only module. Never import this in a "use client" component.
//
// Chat uses OpenRouter's free router. There is no application-level model
// fallback chain.

export const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

export const MODELS = {
  chat: "openrouter/free",
  embedding:
    process.env.OPENROUTER_EMBEDDING_MODEL ??
    "nvidia/llama-nemotron-embed-vl-1b-v2:free",
} as const;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  tools?: Record<string, unknown>[];
  responseFormat?: Record<string, unknown>;
  reasoning?: { effort: "low" | "medium" | "high" };
}

async function callOpenRouterInternal(
  messages: ChatMessage[],
  options: ChatOptions & { model: string },
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : "http://localhost:3000",
        "X-Title": "FitPulse AI Coach",
      },
      body: JSON.stringify({
        model: options.model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 1024,
        ...(options.tools && { tools: options.tools }),
        ...(options.responseFormat && { response_format: options.responseFormat }),
        ...(options.reasoning && { reasoning: options.reasoning }),
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(
        `OpenRouter API error ${res.status}: ${errText || res.statusText}`,
      );
    }

    const json = await res.json();
    const choice = json.choices?.[0];
    const content = choice?.message?.content;
    if (typeof content === "string" && content.trim()) return content;

    const providerMessage = choice?.error?.message ?? json.error?.message;
    const details = [
      providerMessage,
      choice?.finish_reason && `finish_reason=${choice.finish_reason}`,
      json.model && `model=${json.model}`,
    ].filter(Boolean).join(", ");

    if (attempt === 0) {
      console.warn(`[OpenRouter] Empty completion; retrying${details ? ` (${details})` : ""}`);
      continue;
    }
    throw new Error(`Empty response from OpenRouter${details ? `: ${details}` : ""}`);
  }

  throw new Error("Empty response from OpenRouter");
}

export async function callOpenRouter(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<string> {
  return callOpenRouterInternal(messages, { ...options, model: MODELS.chat });
}

async function streamModel(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  messages: ChatMessage[],
  options: ChatOptions & { model: string },
): Promise<void> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000",
      "X-Title": "FitPulse AI Coach",
    },
    body: JSON.stringify({
      model: options.model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 1024,
      stream: true,
      ...(options.tools && { tools: options.tools }),
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `OpenRouter API error ${res.status}: ${errText || res.statusText}`,
    );
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const data = trimmed.slice(6);
      if (data === "[DONE]") {
        controller.close();
        return;
      }

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`));
        }

        const toolCall = parsed.choices?.[0]?.delta?.tool_calls?.[0];
        if (toolCall?.function?.arguments) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ toolCall: { function: toolCall.function } })}\n\n`,
            ),
          );
        }
      } catch {
        // skip malformed JSON lines
      }
    }
  }

  controller.close();
}

export function streamOpenRouter(
  messages: ChatMessage[],
  options: ChatOptions = {},
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        await streamModel(controller, encoder, messages, {
          ...options,
          model: MODELS.chat,
        });
      } catch (err) {
        console.error(
          `[OpenRouter] stream - model "${MODELS.chat}" failed:`,
          err instanceof Error ? err.message : err,
        );
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: "AI model failed. Try again later." })}\n\n`,
          ),
        );
        controller.close();
      }
    },
  });
}

export async function generateEmbedding(
  text: string,
): Promise<number[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

  const res = await fetch(`${OPENROUTER_BASE}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000",
      "X-Title": "FitPulse AI Coach",
    },
    body: JSON.stringify({
      model: MODELS.embedding,
      input: text,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `OpenRouter Embedding API error ${res.status}: ${errText || res.statusText}`,
    );
  }

  const json = await res.json();
  const embedding = json.data?.[0]?.embedding;
  if (!embedding) throw new Error("Empty embedding response from OpenRouter");
  return (embedding as number[]).slice(0, 1024);
}
