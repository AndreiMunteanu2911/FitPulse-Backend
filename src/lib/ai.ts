// OpenRouter API client.
// Server-only module. Never import this in a "use client" component.
//
// Env-configured models are tried first, then a built-in free-model chain so
// production does not depend on every Vercel variable being present.

export const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

function resolveEnvList(...keys: string[]): string[] {
  return keys.map((key) => process.env[key]).filter(Boolean) as string[];
}

function dedupeModels(models: string[]): string[] {
  return [...new Set(models.filter(Boolean))];
}

const DEFAULT_CHAT_MODELS = [
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "qwen/qwen3-coder:free",
  "minimax/minimax-m2.5:free",
  "openai/gpt-oss-20b:free",
  "google/gemma-3-4b-it:free",
  "meta-llama/llama-3.2-3b-instruct:free",
  "openrouter/free",
];

/** Ordered list of chat models to try, env first and built-in fallbacks last. */
export const CHAT_MODELS = dedupeModels([
  ...resolveEnvList(
    "OPENROUTER_CHAT_MODEL",
    "OPENROUTER_FALLBACK_MODEL",
    "OPENROUTER_FALLBACK_MODEL_2",
    "OPENROUTER_FALLBACK_MODEL_3",
    "OPENROUTER_FALLBACK_MODEL_4",
    "OPENROUTER_FALLBACK_MODEL_5",
    "OPENROUTER_FALLBACK_MODEL_6",
    "OPENROUTER_FALLBACK_MODEL_LAST",
  ),
  ...DEFAULT_CHAT_MODELS,
]);

export const MODELS = {
  chat: process.env.OPENROUTER_CHAT_MODEL ?? DEFAULT_CHAT_MODELS[0],
  fallback: process.env.OPENROUTER_FALLBACK_MODEL ?? DEFAULT_CHAT_MODELS[1],
  embedding:
    process.env.OPENROUTER_EMBEDDING_MODEL ??
    "nvidia/llama-nemotron-embed-vl-1b-v2:free",
} as const;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: Record<string, unknown>[];
}

async function tryWithFallbacks<T>(
  models: string[],
  fn: (model: string) => Promise<T>,
  label: string,
): Promise<T> {
  let lastErr: unknown;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    if (i > 0) {
      console.warn(`[OpenRouter] ${label} - trying fallback #${i}: "${model}"`);
    }

    try {
      return await fn(model);
    } catch (err) {
      lastErr = err;
      console.warn(
        `[OpenRouter] ${label} - model "${model}" failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.error(
    `[OpenRouter] ${label} - all ${models.length} models failed. Last error:`,
    lastErr,
  );
  throw lastErr;
}

async function callOpenRouterInternal(
  messages: ChatMessage[],
  options: ChatOptions & { model: string },
): Promise<string> {
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
      ...(options.tools && { tools: options.tools }),
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `OpenRouter API error ${res.status}: ${errText || res.statusText}`,
    );
  }

  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty response from OpenRouter");
  return content;
}

export async function callOpenRouter(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<string> {
  const preferredModels = options.model
    ? [options.model, ...CHAT_MODELS.filter((model) => model !== options.model)]
    : CHAT_MODELS;

  return tryWithFallbacks(
    preferredModels,
    (model) => callOpenRouterInternal(messages, { ...options, model }),
    "chat",
  );
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
  const preferredModels = options.model
    ? [options.model, ...CHAT_MODELS.filter((model) => model !== options.model)]
    : CHAT_MODELS;

  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      for (let i = 0; i < preferredModels.length; i++) {
        const model = preferredModels[i];
        if (i > 0) {
          console.warn(
            `[OpenRouter] stream - trying fallback #${i}: "${model}"`,
          );
        }

        try {
          await streamModel(controller, encoder, messages, { ...options, model });
          return;
        } catch (err) {
          console.warn(
            `[OpenRouter] stream - model "${model}" failed:`,
            err instanceof Error ? err.message : err,
          );
        }
      }

      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ error: "All chat models failed. Try again later." })}\n\n`,
        ),
      );
      controller.close();
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
