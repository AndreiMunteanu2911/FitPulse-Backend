// ── AI System Prompts ────────────────────────────────────────────────────────
// Carefully crafted prompts that define the AI coach persona, inject user data,
// and enforce safety guardrails.
// ─────────────────────────────────────────────────────────────────────────────

import type { FullRAGContext } from "./rag-context";
import type { ClassifiedIntent } from "./rag-intent";

// ── Base System Prompt ──────────────────────────────────────────────────────
export const SYSTEM_PROMPT = `You are FitPulse AI Coach — a knowledgeable, encouraging, and data-driven fitness assistant.

CORE PRINCIPLES:
1. Always reference actual data from the user's workout history. Be specific with sets, reps, and weights (e.g., "bench press at 80kg for 5 reps, 3 sets").
2. NEVER mention "volume" or "tonnage" numbers — users think in sets/reps/weight, not total kg lifted.
3. NEVER mention database IDs, technical identifiers, or UUIDs to the user.
4. Only reference dates that appear in the provided data. Never guess, invent, or approximate dates.
5. Be encouraging but honest about plateaus or regressions.
6. Suggest actionable, specific next steps based on the user's actual training patterns. When recommending progressive overload, give exact weights (e.g., "Try 82.5kg for 5 reps next session").
7. Keep responses concise — 2-4 short paragraphs max. Use bullet points for lists.
8. Acknowledge when data is thin: "You've only logged 2 workouts so far, so I can't spot trends yet."

EXERCISE ID RULES (CRITICAL):
- The system provides you with a full EXERCISE ID REFERENCE list mapping exercise names to their exact database IDs.
- When creating workouts or referencing exercises, you MUST use ONLY the exact IDs from that reference list.
- NEVER invent, guess, or hallucinate exercise IDs. If you're unsure, use the exercise name and the system will resolve it.
- Custom exercises are marked with "[custom]" — use their IDs with the "custom_" prefix exactly as shown.

SAFETY GUARDRAILS:
- NEVER give medical advice. If the user asks about injuries, pain, or health conditions, recommend consulting a healthcare professional.
- NEVER recommend dangerous practices (e.g., extreme caloric deficits, performance-enhancing drugs).
- If the user seems to be overtraining, suggest rest and recovery.
- If data is insufficient, say so honestly rather than guessing.

RESPONSE STYLE:
- Conversational but professional — like a knowledgeable personal trainer.
- Use the user's actual exercise names and numbers.
- When suggesting progressions, be specific with exact weights and rep targets.
- Acknowledge achievements with real numbers: "Your bench press has gone from 60kg × 5 to 80kg × 5 over 8 sessions!"
- Do not use Markdown headings, horizontal rules, or emoji in responses.`;

// ── Context Injection Template ──────────────────────────────────────────────
export function buildContextPrompt(
  context: FullRAGContext,
  intent: ClassifiedIntent,
): string {
  const sections: string[] = [];

  // User stats
  if (context.userStats) {
    const s = context.userStats;
    sections.push(`USER PROFILE:
- Level: ${s.level} | XP: ${s.totalXP} | Streak: ${s.currentStreak} days (best: ${s.longestStreak})
- Total workouts: ${s.totalWorkouts} | Total volume: ${s.totalVolume.toLocaleString()} kg
- Personal records: ${s.prCount}`);
  }

  // Exercise-specific progress
  if (context.exerciseProgress) {
    const ep = context.exerciseProgress;
    const prText = ep.currentPR
      ? `Current PR: ${ep.currentPR.maxWeight}kg × ${ep.currentPR.maxReps} reps`
      : "No PR recorded yet";
    const recentText = ep.recentSessions
      .slice(0, 3)
      .map(
        (s) =>
          `  ${s.date}: ${s.sets.map((set) => `${set.weight}kg×${set.reps}`).join(", ")} (vol: ${s.totalVolume}kg)`,
      )
      .join("\n");

    sections.push(`EXERCISE FOCUS — ${ep.exerciseName}:
- ${prText}
- Volume trend: ${ep.volumeTrend}
- Total sessions: ${ep.totalSessions}
- Recent sessions:
${recentText}`);
  }

  // Recent workouts
  if (context.recentWorkouts.length > 0) {
    const wcText = context.recentWorkouts
      .map(
        (w) =>
          `${w.dateLabel} — "${w.name}": ${w.exercises.map((e) => `${e.exerciseName} (${e.sets.map((s) => `${s.weight}kg×${s.reps}`).join(", ")})`).join(", ")}`,
      )
      .join("\n");

    sections.push(`RECENT WORKOUTS:
${wcText}`);
  }

  // Muscle gaps
  if (context.muscleGaps) {
    const mg = context.muscleGaps;
    const undertrained =
      mg.undertrained.length > 0
        ? mg.undertrained.map((m) => `${m} (last: ${mg.lastTrainedLabel[m] ?? "unknown"})`).join(", ")
        : "None — all muscles trained recently";
    const wellTrained =
      mg.wellTrained.length > 0
        ? mg.wellTrained.join(", ")
        : "None";

    sections.push(`MUSCLE RECOVERY STATUS:
- Undertrained (5+ days): ${undertrained}
- Recently trained (≤2 days): ${wellTrained}`);
  }

  // Similar exercises
  if (context.similarExercises.length > 0) {
    const simText = context.similarExercises
      .map(
        (e) =>
          `${e.name} (${e.targetMuscles.join(", ")}) — ${(e.similarity * 100).toFixed(0)}% match`,
      )
      .join("\n");

    sections.push(`SIMILAR EXERCISES:
${simText}`);
  }

  // Intent hint
  const intentHints: Record<string, string> = {
    progress_check:
      "The user is asking about their progress on a specific exercise or metric. Focus on trends, numbers, and whether they're improving.",
    advice:
      "The user wants advice on overcoming a challenge. Be specific and actionable. Reference their data to give tailored advice.",
    comparison:
      "The user wants to compare two or more exercises. Compare their PRs, volume trends, and session counts.",
    recommendation:
      "The user wants a training recommendation. Use muscle gap analysis to suggest what they should train next. Be specific.",
    workout_request:
      "The user wants you to create a workout for them. You have access to a tool called 'create_draft_workout' — use it to generate a structured workout based on their data, muscle gaps, and training history.",
    general:
      "The user has a general fitness question. Answer knowledgeably and try to connect it to their actual data when relevant.",
  };

  sections.push(`QUERY TYPE: ${intent.intent}\n${intentHints[intent.intent] ?? ""}`);

  // Exercise ID reference (always included — the AI needs this for workout creation)
  if (context.exerciseIndex) {
    sections.push(context.exerciseIndex);
  }

  return sections.join("\n\n---\n\n");
}

// ── Tool Definition for Workout Creation ────────────────────────────────────
export const CREATE_WORKOUT_TOOL = {
  type: "function",
  function: {
    name: "create_draft_workout",
    description:
      "Create a draft workout in the user's FitPulse account. Use this when the user asks for a workout to be created, or when you've recommended a specific workout and they seem ready to start it.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Descriptive name for the workout (e.g., 'AI Push Day', 'Heavy Legs')",
        },
        exercises: {
          type: "array",
          description: "List of exercises with sets, reps, and weights",
          items: {
            type: "object",
            properties: {
              exercise_id: {
                type: "string",
                description:
                  "The exercise ID (e.g., 'bench-press', 'barbell-squat'). Use standard exercise IDs from the user's exercise library.",
              },
              sets: {
                type: "array",
                description: "Sets for this exercise",
                items: {
                  type: "object",
                  properties: {
                    reps: {
                      type: "integer",
                      description: "Number of reps",
                    },
                    weight: {
                      type: "number",
                      description: "Weight in kg",
                    },
                  },
                  required: ["reps", "weight"],
                },
              },
            },
            required: ["exercise_id", "sets"],
          },
        },
      },
      required: ["name", "exercises"],
    },
  },
};

// ── Workout Creation Follow-up Prompt ───────────────────────────────────────
export const WORKOUT_CREATED_MESSAGE = (workoutName: string) =>
  `I've created a **${workoutName}** workout for you! You can review and adjust the sets before starting.\n\nWant me to modify anything or create a different workout?`;
