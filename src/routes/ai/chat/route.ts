// ── AI Chat API Route (Streaming) ───────────────────────────────────────────
// POST /api/ai/chat
// Body: { message: string, conversationHistory?: { role, content }[] }
// Response: SSE stream with text chunks, ending with a JSON action (if any).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "../../../compat/next-server";
import { createSupabaseServerClient } from "../../../helper/supabaseServer";
import { classifyIntent, extractWorkoutType } from "../../../lib/rag-intent";
import { buildFullContext, buildUserStatsContext, buildRecentWorkouts, buildMuscleGapAnalysis } from "../../../lib/rag-context";
import { buildContextPrompt, SYSTEM_PROMPT } from "../../../lib/ai-prompts";
import { streamOpenRouter, generateEmbedding, type ChatMessage } from "../../../lib/ai";
import { generateSmartWorkout } from "../../../lib/workout-generator";
import { buildExerciseIndex } from "../../../lib/exercise-index";
import { z } from "zod";

export const maxDuration = 60;

const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  conversationHistory: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(12000),
  })).max(20).default([]),
});

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = chatRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  const { message, conversationHistory } = parsed.data;

  // 1. Classify intent
  const intent = classifyIntent(message);

  // 2. Generate embedding for the query (for similarity search)
  let queryEmbedding: number[] | undefined;
  try {
    queryEmbedding = await generateEmbedding(message);
  } catch {
    // Embedding failure is non-fatal — proceed without it
    queryEmbedding = undefined;
  }

  // 3. Build exercise index (needed for context + workout creation)
  const exerciseIndexArray = await buildExerciseIndex(supabase, user.id);

  // 4. Build RAG context (includes exercise index text from buildFullContext)
  const context = await buildFullContext(supabase, user.id, intent, queryEmbedding);

  // 5. If workout request, prepare it for review. The draft is only inserted
  // when the user clicks Start Workout in the chat.
  let workoutAction: { type: string; name: string; exercises: { exerciseId: string; name: string; sets: { reps: number; weight: number }[] }[] } | null = null;
  if (intent.needsWorkoutCreation) {
    try {
      const draft = generateSmartWorkout(
        context.muscleGaps,
        context.recentWorkouts,
        exerciseIndexArray,
        extractWorkoutType(message) ?? undefined,
      );

      // Resolve exercise names for the action (for display in UI)
      const exercisesWithNames = draft.exercises.map((ex) => {
        const entry = exerciseIndexArray.find((e) => e.id === ex.exercise_id);
        return {
          exerciseId: ex.exercise_id,
          name: entry?.name ?? ex.exercise_id,
          sets: ex.sets.map((s) => ({ reps: s.reps, weight: s.weight })),
        };
      });

      workoutAction = {
        type: "workout_created",
        name: draft.name,
        exercises: exercisesWithNames,
      };
    } catch (err) {
      // If workout generation fails, still proceed with the chat.
      console.error("Workout generation failed:", err);
    }
  }

  // 6. Build messages for the LLM
  const systemContext = buildContextPrompt(context, intent);
  const systemMessage: ChatMessage = {
    role: "system",
    content: `${SYSTEM_PROMPT}\n\n${systemContext}`,
  };

  const messages: ChatMessage[] = [
    systemMessage,
    ...conversationHistory
      .filter(
        (m) => m.role === "user" || m.role === "assistant",
      )
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user", content: message },
  ];

  if (workoutAction) {
    const action = workoutAction;
    const exerciseLines = action.exercises
      .map((ex, index) => {
        const setsByRepWeight = new Map<string, number>();
        for (const set of ex.sets) {
          const key = `${set.reps} reps at ${set.weight}kg`;
          setsByRepWeight.set(key, (setsByRepWeight.get(key) ?? 0) + 1);
        }

        const setSummary = [...setsByRepWeight.entries()]
          .map(([label, count]) => `${count} sets of ${label}`)
          .join(", ");

        return `${index + 1}. ${ex.name}: ${setSummary}`;
      })
      .join("\n");
    const responseText = `I built "${action.name}" around your main push muscles: chest, shoulders, and triceps. The heavier presses come first while you are fresh, then the shoulder and triceps accessories add focused volume without turning it into a long session.\n\nPlan:\n${exerciseLines}\n\nReview it below and start when you are ready.`;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              delta: responseText,
            })}\n\n`,
          ),
        );
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              action: "workout_created",
              name: action.name,
              exercises: action.exercises,
            })}\n\n`,
          ),
        );
        controller.close();
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // 7. Stream the response
  const stream = streamOpenRouter(messages, {
    temperature: 0.7,
    maxTokens: 1024,
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
