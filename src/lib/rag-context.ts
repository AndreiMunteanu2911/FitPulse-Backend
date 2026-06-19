// ── RAG Context Builders ─────────────────────────────────────────────────────
// Server-only module. Fetches user data from Supabase to inject as context
// into the LLM system prompt. Each function returns a JSON-serializable object
// that gets stringified into the prompt.
//
// All functions require a Supabase server client with an authenticated session.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClassifiedIntent } from "./rag-intent";
import { resolveExercises } from "../helper/resolveExercises";
import { buildExerciseIndexText } from "./exercise-index";

// ── Helpers ──────────────────────────────────────────────────────────────────
/** Format a date string as human-readable: "3 days ago (Mar 25)" */
function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86_400_000);

  const label = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  if (diffDays === 0) return `today (${label})`;
  if (diffDays === 1) return `yesterday (${label})`;
  if (diffDays < 7) return `${diffDays} days ago (${label})`;
  return `${Math.floor(diffDays / 7)} weeks ago (${label})`;
}

// ── 1. User Stats Context ───────────────────────────────────────────────────
export interface UserStatsContext {
  level: number;
  totalXP: number;
  currentStreak: number;
  longestStreak: number;
  totalWorkouts: number;
  totalVolume: number;
  prCount: number;
}

export async function buildUserStatsContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserStatsContext | null> {
  // Fetch user_stats
  const { data: stats } = await supabase
    .from("user_stats")
    .select("total_xp, level")
    .eq("user_id", userId)
    .single();

  // Fetch completed workouts
  const { data: workouts } = await supabase
    .from("workouts")
    .select("workout_date, workout_exercises (exercise_id, sets (weight, reps))")
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("workout_date", { ascending: false });

  if (!workouts?.length && !stats) return null;

  const rows = workouts ?? [];
  let totalVolume = 0;
  const exerciseMaxWeights = new Map<string, number>();
  const MS_PER_DAY = 86_400_000;

  rows.forEach((w: Record<string, unknown>) => {
    const exercises = (w.workout_exercises as Record<string, unknown>[]) ?? [];
    exercises.forEach((we) => {
      const sets = (we.sets as Record<string, unknown>[]) ?? [];
      sets.forEach((s) => {
        const vol = (Number(s.weight) || 0) * (Number(s.reps) || 0);
        totalVolume += vol;
        const eid = we.exercise_id as string;
        if (eid) {
          const prev = exerciseMaxWeights.get(eid) ?? 0;
          if (Number(s.weight) > prev) exerciseMaxWeights.set(eid, Number(s.weight));
        }
      });
    });
  });

  // Streak
  const uniqueDates: string[] = [...new Set(rows.map((w) => w.workout_date as string))].sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime(),
  );

  let currentStreak = 0;
  let longestStreak = 0;

  if (uniqueDates.length > 0) {
    const todayStr = new Date().toISOString().split("T")[0];
    const yesterdayStr = new Date(Date.now() - MS_PER_DAY).toISOString().split("T")[0];
    if (uniqueDates[0] === todayStr || uniqueDates[0] === yesterdayStr) {
      currentStreak = 1;
      for (let i = 1; i < uniqueDates.length; i++) {
        const diff =
          (new Date(uniqueDates[i - 1]).getTime() - new Date(uniqueDates[i]).getTime()) /
          MS_PER_DAY;
        if (diff === 1) currentStreak++;
        else break;
      }
    }
    let temp = 1;
    for (let i = 1; i < uniqueDates.length; i++) {
      const diff =
        (new Date(uniqueDates[i - 1]).getTime() - new Date(uniqueDates[i]).getTime()) /
        MS_PER_DAY;
      if (diff === 1) temp++;
      else {
        longestStreak = Math.max(longestStreak, temp);
        temp = 1;
      }
    }
    longestStreak = Math.max(longestStreak, temp);
  }

  return {
    level: Number((stats as Record<string, unknown> | null)?.level) ?? 1,
    totalXP: Number((stats as Record<string, unknown> | null)?.total_xp) ?? 0,
    currentStreak,
    longestStreak,
    totalWorkouts: rows.length,
    totalVolume: Math.round(totalVolume),
    prCount: exerciseMaxWeights.size,
  };
}

// ── 2. Exercise Progress Context ────────────────────────────────────────────
export interface ExerciseProgressContext {
  exerciseId: string;
  exerciseName: string;
  currentPR: { maxWeight: number; maxReps: number } | null;
  recentSessions: {
    date: string;
    sets: { weight: number; reps: number }[];
    totalVolume: number;
  }[];
  volumeTrend: "improving" | "plateauing" | "declining" | "insufficient_data";
  totalSessions: number;
}

export async function buildExerciseProgress(
  supabase: SupabaseClient,
  userId: string,
  exerciseId: string,
): Promise<ExerciseProgressContext | null> {
  // Fetch PR
  const { data: pr } = await supabase
    .from("personal_records")
    .select("max_weight, max_reps")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .single();

  // Fetch all completed workouts containing this exercise
  const { data: workouts } = await supabase
    .from("workouts")
    .select(
      "workout_date, workout_exercises (exercise_id, sets (weight, reps, set_number))",
    )
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("workout_date", { ascending: false });

  if (!workouts?.length) return null;

  // Filter to workouts containing this exercise
  const relevant = workouts
    .map((w: Record<string, unknown>) => {
      const exercises =
        (w.workout_exercises as Record<string, unknown>[]) ?? [];
      const match = exercises.find((we) => we.exercise_id === exerciseId);
      if (!match) return null;

      const sets = ((match.sets as Record<string, unknown>[]) ?? [])
        .sort(
          (a, b) => Number(a.set_number) - Number(b.set_number),
        )
        .map((s) => ({
          weight: Number(s.weight) || 0,
          reps: Number(s.reps) || 0,
        }));

      const totalVolume = sets.reduce(
        (sum, s) => sum + s.weight * s.reps,
        0,
      );

      return {
        date: w.workout_date as string,
        sets,
        totalVolume,
      };
    })
    .filter(Boolean) as ExerciseProgressContext["recentSessions"];

  if (relevant.length === 0) return null;

  // Resolve exercise name
  const exerciseMap = await resolveExercises(supabase, [exerciseId]);
  const exerciseName = exerciseMap.get(exerciseId)?.name ?? exerciseId;

  // Volume trend (simple: compare avg of last 3 sessions vs previous 3)
  let volumeTrend: ExerciseProgressContext["volumeTrend"] = "insufficient_data";
  if (relevant.length >= 4) {
    const recent = relevant.slice(0, 3);
    const older = relevant.slice(3, 6);
    const avgRecent =
      recent.reduce((s, r) => s + r.totalVolume, 0) / recent.length;
    const avgOlder =
      older.length > 0
        ? older.reduce((s, r) => s + r.totalVolume, 0) / older.length
        : avgRecent;
    const change = (avgRecent - avgOlder) / (avgOlder || 1);

    if (change > 0.05) volumeTrend = "improving";
    else if (change < -0.05) volumeTrend = "declining";
    else volumeTrend = "plateauing";
  }

  return {
    exerciseId,
    exerciseName,
    currentPR: pr
      ? {
          maxWeight: Number((pr as Record<string, unknown>).max_weight) || 0,
          maxReps: Number((pr as Record<string, unknown>).max_reps) || 0,
        }
      : null,
    recentSessions: relevant.slice(0, 8), // last 8 sessions
    volumeTrend,
    totalSessions: relevant.length,
  };
}

// ── 3. Recent Workouts Context ──────────────────────────────────────────────
export interface RecentWorkoutContext {
  date: string;
  dateLabel: string;
  name: string;
  exercises: {
    exerciseId: string;
    exerciseName: string;
    sets: { weight: number; reps: number }[];
    totalVolume: number;
  }[];
  totalVolume: number;
  durationMinutes: number | null;
}

export async function buildRecentWorkouts(
  supabase: SupabaseClient,
  userId: string,
  limit = 5,
): Promise<RecentWorkoutContext[]> {
  const { data: workouts } = await supabase
    .from("workouts")
    .select(
      "workout_date, name, finished_at, workout_exercises (exercise_id, sets (weight, reps, set_number))",
    )
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("workout_date", { ascending: false })
    .limit(limit);

  if (!workouts?.length) return [];

  // Collect all exercise IDs for batch resolution
  const allExerciseIds = new Set<string>();
  workouts.forEach((w: Record<string, unknown>) => {
    const exercises =
      (w.workout_exercises as Record<string, unknown>[]) ?? [];
    exercises.forEach((we) => {
      if (we.exercise_id) allExerciseIds.add(we.exercise_id as string);
    });
  });

  const exerciseMap = await resolveExercises(
    supabase,
    [...allExerciseIds],
  );

  return workouts.map((w: Record<string, unknown>) => {
    const exercises =
      (w.workout_exercises as Record<string, unknown>[]) ?? [];
    let workoutTotalVolume = 0;

    const resolvedExercises = exercises.map((we) => {
      const sets = ((we.sets as Record<string, unknown>[]) ?? [])
        .sort(
          (a, b) => Number(a.set_number) - Number(b.set_number),
        )
        .map((s) => ({
          weight: Number(s.weight) || 0,
          reps: Number(s.reps) || 0,
        }));

      const vol = sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
      workoutTotalVolume += vol;

      const info = exerciseMap.get(we.exercise_id as string);
      return {
        exerciseId: we.exercise_id as string,
        exerciseName: info?.name ?? (we.exercise_id as string),
        sets,
        totalVolume: vol,
      };
    });

    const finishedAt = w.finished_at as string | null;
    const durationMinutes =
      finishedAt && w.workout_date
        ? Math.round(
            (new Date(finishedAt).getTime() -
              new Date(w.workout_date as string).getTime()) /
              60000,
          )
        : null;

    return {
      date: w.workout_date as string,
      dateLabel: formatDateLabel(w.workout_date as string),
      name: (w.name as string) || "Workout",
      exercises: resolvedExercises,
      totalVolume: workoutTotalVolume,
      durationMinutes,
    };
  });
}

// ── 4. Muscle Gap Analysis ──────────────────────────────────────────────────
export interface MuscleGapContext {
  lastTrained: Record<string, string>; // muscle → last workout date (raw)
  lastTrainedLabel: Record<string, string>; // muscle → human-readable date
  daysSinceTrained: Record<string, number>;
  undertrained: string[]; // muscles not trained in 5+ days
  wellTrained: string[]; // muscles trained in last 2 days
}

const MUSCLE_TO_EXERCISES: Record<string, string[]> = {
  chest: ["bench-press", "incline-bench-press", "decline-bench-press", "cable-crossover", "dumbbell-fly", "pec-deck-fly", "chest-press-machine"],
  back: ["barbell-row", "pull-up", "lat-pulldown", "t-bar-row", "face-pull"],
  shoulders: ["overhead-press", "lateral-raise"],
  biceps: ["bicep-curl", "hammer-curl", "chin-up"],
  triceps: ["tricep-extension", "tricep-pushdown", "dip"],
  quads: ["barbell-squat", "front-squat", "leg-press", "leg-extension", "lunge", "bulgarian-split-squat"],
  hamstrings: ["romanian-deadlift", "leg-curl", "barbell-deadlift"],
  glutes: ["barbell-hip-thrust", "barbell-deadlift", "bulgarian-split-squat"],
  calves: ["calf-raise"],
  abs: [], // abs are often trained indirectly
};

export async function buildMuscleGapAnalysis(
  supabase: SupabaseClient,
  userId: string,
): Promise<MuscleGapContext> {
  const { data: workouts } = await supabase
    .from("workouts")
    .select(
      "workout_date, workout_exercises (exercise_id)",
    )
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("workout_date", { ascending: false })
    .limit(30);

  const lastTrained: Record<string, string> = {};
  const lastTrainedLabel: Record<string, string> = {};
  const daysSinceTrained: Record<string, number> = {};

  if (workouts?.length) {
    // For each muscle, find the most recent workout containing a relevant exercise
    for (const [muscle, exerciseIds] of Object.entries(MUSCLE_TO_EXERCISES)) {
      for (const w of workouts) {
        const exercises =
          (w.workout_exercises as Record<string, unknown>[]) ?? [];
        const hasMuscle = exercises.some(
          (we) => exerciseIds.includes(we.exercise_id as string),
        );
        if (hasMuscle) {
          const dateStr = w.workout_date as string;
          lastTrained[muscle] = dateStr;
          lastTrainedLabel[muscle] = formatDateLabel(dateStr);
          daysSinceTrained[muscle] = Math.round(
            (Date.now() - new Date(dateStr + "T00:00:00").getTime()) /
              86_400_000,
          );
          break;
        }
      }
    }
  }

  const undertrained = Object.entries(daysSinceTrained)
    .filter(([, days]) => days >= 5)
    .map(([muscle]) => muscle);

  const wellTrained = Object.entries(daysSinceTrained)
    .filter(([, days]) => days <= 2)
    .map(([muscle]) => muscle);

  return { lastTrained, lastTrainedLabel, daysSinceTrained, undertrained, wellTrained };
}

// ── 5. Similar Exercises via pgvector ────────────────────────────────────────
export interface SimilarExerciseResult {
  exerciseId: string;
  name: string;
  similarity: number;
  targetMuscles: string[];
  bodyParts: string[];
}

export async function findSimilarExercises(
  supabase: SupabaseClient,
  queryEmbedding: number[],
  limit = 5,
): Promise<SimilarExerciseResult[]> {
  if (queryEmbedding.length !== 1024) return [];

  // Try the RPC first — if it doesn't exist, fall back to raw query
  let data: Record<string, unknown>[] | null = null;
  try {
    const result = await supabase.rpc("vector_similarity_search", {
      query_embedding: queryEmbedding,
      match_limit: limit,
    });
    data = result.data;
  } catch {
    // RPC doesn't exist — fall back to raw query
  }

  // Fallback: if the RPC function doesn't exist, do a raw query
  if (!data) {
    const { data: raw } = await supabase
      .from("exercise_embeddings")
      .select("exercise_id, embedding, metadata")
      .limit(50);

    if (!raw) return [];

    // Compute cosine similarity in JS (small dataset, acceptable)
    const results = raw
      .map((row: Record<string, unknown>) => {
        const emb = row.embedding as number[];
        const sim = cosineSimilarity(queryEmbedding, emb);
        const meta = row.metadata as Record<string, unknown>;
        return {
          exerciseId: row.exercise_id as string,
          name: (meta?.name as string) ?? row.exercise_id,
          similarity: sim,
          targetMuscles: (meta?.target_muscles as string[]) ?? [],
          bodyParts: (meta?.body_parts as string[]) ?? [],
        };
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return results;
  }

  return (data as Record<string, unknown>[]).map((row) => ({
    exerciseId: row.exercise_id as string,
    name: (row.name as string) ?? row.exercise_id,
    similarity: Number(row.similarity) ?? 0,
    targetMuscles: (row.target_muscles as string[]) ?? [],
    bodyParts: (row.body_parts as string[]) ?? [],
  }));
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ── 6. Full Context Builder (orchestrator) ───────────────────────────────────
export interface FullRAGContext {
  userStats: UserStatsContext | null;
  recentWorkouts: RecentWorkoutContext[];
  exerciseProgress: ExerciseProgressContext | null;
  muscleGaps: MuscleGapContext | null;
  similarExercises: SimilarExerciseResult[];
  exerciseIndex: string | null;  // Full exercise index text for AI prompt
}

export async function buildFullContext(
  supabase: SupabaseClient,
  userId: string,
  intent: ClassifiedIntent,
  queryEmbedding?: number[],
): Promise<FullRAGContext> {
  // Always fetch user stats, recent workouts, and exercise index
  const [userStats, recentWorkouts, exerciseIndex] = await Promise.all([
    buildUserStatsContext(supabase, userId),
    buildRecentWorkouts(supabase, userId, 5),
    buildExerciseIndexText(supabase, userId),
  ]);

  // Conditionally fetch exercise-specific context
  let exerciseProgress: ExerciseProgressContext | null = null;
  if (intent.detectedExercises.length > 0) {
    exerciseProgress = await buildExerciseProgress(
      supabase,
      userId,
      intent.detectedExercises[0],
    );
  }

  // Muscle gap analysis for recommendations
  let muscleGaps: MuscleGapContext | null = null;
  if (
    intent.intent === "recommendation" ||
    intent.intent === "workout_request" ||
    intent.intent === "advice"
  ) {
    muscleGaps = await buildMuscleGapAnalysis(supabase, userId);
  }

  // Similar exercises via embeddings
  let similarExercises: SimilarExerciseResult[] = [];
  if (queryEmbedding && intent.intent !== "progress_check") {
    similarExercises = await findSimilarExercises(supabase, queryEmbedding, 5);
  }

  return {
    userStats,
    recentWorkouts,
    exerciseProgress,
    muscleGaps,
    similarExercises,
    exerciseIndex,
  };
}
