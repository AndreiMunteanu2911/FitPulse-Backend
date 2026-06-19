// ── Workout Generator ───────────────────────────────────────────────────────
// Server-only module. Creates draft workouts in the database based on LLM
// output or intelligent defaults using the user's training history.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MuscleGapContext, RecentWorkoutContext } from "./rag-context";
import { extractWorkoutType } from "./rag-intent";
import { resolveExerciseInput, buildExerciseIndex, type ExerciseEntry } from "./exercise-index";

export interface DraftSet {
  reps: number;
  weight: number;
  is_confirmed: boolean;
}

export interface DraftExercise {
  exercise_id: string;
  sets: DraftSet[];
}

export interface DraftWorkout {
  name: string;
  exercises: DraftExercise[];
}

export interface CreatedWorkoutResult {
  workoutId: string;
  name: string;
  exerciseCount: number;
  exercises: DraftExercise[];
}

// ── Default workout templates (fallback when LLM is unavailable) ─────────────
// NOTE: exercise_name is a human-readable name resolved to real DB IDs at runtime.
interface TemplateExercise {
  exercise_name: string;
  sets: DraftSet[];
}

interface TemplateWorkout {
  name: string;
  exercises: TemplateExercise[];
}

const DEFAULT_TEMPLATES: Record<string, TemplateWorkout> = {
  push: {
    name: "Push Day",
    exercises: [
      { exercise_name: "bench press", sets: [{ weight: 80, reps: 5, is_confirmed: false }, { weight: 80, reps: 5, is_confirmed: false }, { weight: 80, reps: 5, is_confirmed: false }, { weight: 75, reps: 8, is_confirmed: false }, { weight: 75, reps: 8, is_confirmed: false }] },
      { exercise_name: "incline bench press", sets: [{ weight: 60, reps: 8, is_confirmed: false }, { weight: 60, reps: 8, is_confirmed: false }, { weight: 60, reps: 8, is_confirmed: false }] },
      { exercise_name: "overhead press", sets: [{ weight: 40, reps: 8, is_confirmed: false }, { weight: 40, reps: 8, is_confirmed: false }, { weight: 40, reps: 8, is_confirmed: false }] },
      { exercise_name: "lateral raise", sets: [{ weight: 10, reps: 12, is_confirmed: false }, { weight: 10, reps: 12, is_confirmed: false }, { weight: 10, reps: 12, is_confirmed: false }] },
      { exercise_name: "tricep extension", sets: [{ weight: 15, reps: 12, is_confirmed: false }, { weight: 15, reps: 12, is_confirmed: false }, { weight: 15, reps: 12, is_confirmed: false }] },
    ],
  },
  pull: {
    name: "Pull Day",
    exercises: [
      { exercise_name: "barbell row", sets: [{ weight: 60, reps: 8, is_confirmed: false }, { weight: 60, reps: 8, is_confirmed: false }, { weight: 60, reps: 8, is_confirmed: false }, { weight: 60, reps: 8, is_confirmed: false }] },
      { exercise_name: "lat pulldown", sets: [{ weight: 50, reps: 10, is_confirmed: false }, { weight: 50, reps: 10, is_confirmed: false }, { weight: 50, reps: 10, is_confirmed: false }] },
      { exercise_name: "barbell deadlift", sets: [{ weight: 100, reps: 5, is_confirmed: false }, { weight: 100, reps: 5, is_confirmed: false }, { weight: 100, reps: 5, is_confirmed: false }] },
      { exercise_name: "face pull", sets: [{ weight: 15, reps: 15, is_confirmed: false }, { weight: 15, reps: 15, is_confirmed: false }, { weight: 15, reps: 15, is_confirmed: false }] },
      { exercise_name: "bicep curl", sets: [{ weight: 12, reps: 12, is_confirmed: false }, { weight: 12, reps: 12, is_confirmed: false }, { weight: 12, reps: 12, is_confirmed: false }] },
    ],
  },
  legs: {
    name: "Leg Day",
    exercises: [
      { exercise_name: "barbell squat", sets: [{ weight: 80, reps: 5, is_confirmed: false }, { weight: 80, reps: 5, is_confirmed: false }, { weight: 80, reps: 5, is_confirmed: false }, { weight: 80, reps: 5, is_confirmed: false }] },
      { exercise_name: "romanian deadlift", sets: [{ weight: 60, reps: 8, is_confirmed: false }, { weight: 60, reps: 8, is_confirmed: false }, { weight: 60, reps: 8, is_confirmed: false }] },
      { exercise_name: "leg press", sets: [{ weight: 120, reps: 10, is_confirmed: false }, { weight: 120, reps: 10, is_confirmed: false }, { weight: 120, reps: 10, is_confirmed: false }] },
      { exercise_name: "leg curl", sets: [{ weight: 30, reps: 12, is_confirmed: false }, { weight: 30, reps: 12, is_confirmed: false }, { weight: 30, reps: 12, is_confirmed: false }] },
      { exercise_name: "calf raise", sets: [{ weight: 40, reps: 15, is_confirmed: false }, { weight: 40, reps: 15, is_confirmed: false }, { weight: 40, reps: 15, is_confirmed: false }] },
    ],
  },
  upper: {
    name: "Upper Body",
    exercises: [
      { exercise_name: "bench press", sets: [{ weight: 80, reps: 5, is_confirmed: false }, { weight: 80, reps: 5, is_confirmed: false }, { weight: 80, reps: 5, is_confirmed: false }] },
      { exercise_name: "barbell row", sets: [{ weight: 60, reps: 8, is_confirmed: false }, { weight: 60, reps: 8, is_confirmed: false }, { weight: 60, reps: 8, is_confirmed: false }] },
      { exercise_name: "overhead press", sets: [{ weight: 40, reps: 8, is_confirmed: false }, { weight: 40, reps: 8, is_confirmed: false }, { weight: 40, reps: 8, is_confirmed: false }] },
      { exercise_name: "pull up", sets: [{ weight: 0, reps: 8, is_confirmed: false }, { weight: 0, reps: 8, is_confirmed: false }, { weight: 0, reps: 8, is_confirmed: false }] },
      { exercise_name: "lateral raise", sets: [{ weight: 10, reps: 12, is_confirmed: false }, { weight: 10, reps: 12, is_confirmed: false }] },
      { exercise_name: "bicep curl", sets: [{ weight: 12, reps: 12, is_confirmed: false }, { weight: 12, reps: 12, is_confirmed: false }] },
    ],
  },
  lower: {
    name: "Lower Body",
    exercises: [
      { exercise_name: "barbell squat", sets: [{ weight: 80, reps: 5, is_confirmed: false }, { weight: 80, reps: 5, is_confirmed: false }, { weight: 80, reps: 5, is_confirmed: false }] },
      { exercise_name: "barbell deadlift", sets: [{ weight: 100, reps: 5, is_confirmed: false }, { weight: 100, reps: 5, is_confirmed: false }, { weight: 100, reps: 5, is_confirmed: false }] },
      { exercise_name: "barbell hip thrust", sets: [{ weight: 80, reps: 10, is_confirmed: false }, { weight: 80, reps: 10, is_confirmed: false }, { weight: 80, reps: 10, is_confirmed: false }] },
      { exercise_name: "leg extension", sets: [{ weight: 40, reps: 12, is_confirmed: false }, { weight: 40, reps: 12, is_confirmed: false }, { weight: 40, reps: 12, is_confirmed: false }] },
      { exercise_name: "calf raise", sets: [{ weight: 40, reps: 15, is_confirmed: false }, { weight: 40, reps: 15, is_confirmed: false }] },
    ],
  },
  full_body: {
    name: "Full Body",
    exercises: [
      { exercise_name: "barbell squat", sets: [{ weight: 80, reps: 5, is_confirmed: false }, { weight: 80, reps: 5, is_confirmed: false }, { weight: 80, reps: 5, is_confirmed: false }] },
      { exercise_name: "bench press", sets: [{ weight: 80, reps: 5, is_confirmed: false }, { weight: 80, reps: 5, is_confirmed: false }, { weight: 80, reps: 5, is_confirmed: false }] },
      { exercise_name: "barbell row", sets: [{ weight: 60, reps: 8, is_confirmed: false }, { weight: 60, reps: 8, is_confirmed: false }, { weight: 60, reps: 8, is_confirmed: false }] },
      { exercise_name: "overhead press", sets: [{ weight: 40, reps: 8, is_confirmed: false }, { weight: 40, reps: 8, is_confirmed: false }] },
      { exercise_name: "romanian deadlift", sets: [{ weight: 60, reps: 8, is_confirmed: false }, { weight: 60, reps: 8, is_confirmed: false }] },
    ],
  },
};

// ── Resolve template exercise names to real DB IDs ──────────────────────────
function resolveTemplateExercises(
  template: TemplateWorkout,
  exerciseIndex: ExerciseEntry[],
  recentWorkouts: RecentWorkoutContext[],
): DraftWorkout {
  // Build a map of exercise → recent weight used
  const recentWeights = new Map<string, number>();
  for (const w of recentWorkouts) {
    for (const e of w.exercises) {
      const maxWeight = Math.max(...e.sets.map((s) => s.weight));
      if (maxWeight > 0) {
        recentWeights.set(e.exerciseName.toLowerCase(), maxWeight);
      }
    }
  }

  const resolvedExercises = template.exercises.map((ex) => {
    // Resolve name to ID
    const resolvedId = resolveExerciseInput(ex.exercise_name, exerciseIndex);
    if (!resolvedId) {
      // Skip exercises we can't resolve — better than inserting garbage
      return null;
    }

    // Adapt weight based on recent performance
    const recentMax = recentWeights.get(ex.exercise_name);
    const scaleFactor = 1.0;
    const adaptedSets = ex.sets.map((s) => ({
      ...s,
      weight: s.weight > 0 && recentMax ? Math.round((recentMax * scaleFactor) / 2.5) * 2.5 : s.weight,
    }));

    return {
      exercise_id: resolvedId,
      sets: adaptedSets,
    };
  }).filter(Boolean) as DraftExercise[];

  return {
    name: template.name,
    exercises: resolvedExercises,
  };
}

// ── Smart workout generation (uses user's actual data) ───────────────────────
export function generateSmartWorkout(
  muscleGaps: MuscleGapContext | null,
  recentWorkouts: RecentWorkoutContext[],
  exerciseIndex: ExerciseEntry[],
  workoutType?: string,
): DraftWorkout {
  // If a specific type is requested, use or adapt the default template
  const type = workoutType?.toLowerCase().replace(/\s+/g, "_") ?? null;

  if (type && DEFAULT_TEMPLATES[type]) {
    return resolveTemplateExercises(DEFAULT_TEMPLATES[type], exerciseIndex, recentWorkouts);
  }

  // Auto-detect based on muscle gaps: pick the most undertrained muscle group
  if (muscleGaps && muscleGaps.undertrained.length > 0) {
    const primary = muscleGaps.undertrained[0];
    const typeMap: Record<string, string> = {
      chest: "push",
      back: "pull",
      shoulders: "push",
      biceps: "pull",
      triceps: "push",
      quads: "legs",
      hamstrings: "legs",
      glutes: "legs",
      calves: "legs",
    };
    const mappedType = typeMap[primary];
    if (mappedType && DEFAULT_TEMPLATES[mappedType]) {
      return resolveTemplateExercises(DEFAULT_TEMPLATES[mappedType], exerciseIndex, recentWorkouts);
    }
  }

  // Default: full body
  return resolveTemplateExercises(DEFAULT_TEMPLATES.full_body, exerciseIndex, recentWorkouts);
}

// ── Create draft workout in Supabase ─────────────────────────────────────────
export async function createDraftWorkoutInDB(
  supabase: SupabaseClient,
  userId: string,
  workout: DraftWorkout,
): Promise<CreatedWorkoutResult> {
  void userId;
  const { data: workoutId, error } = await supabase.rpc("replace_workout_draft", {
    p_name: workout.name,
    p_exercises: workout.exercises,
  });
  if (error || !workoutId) {
    throw new Error(`Failed to create workout: ${error?.message ?? "Unknown error"}`);
  }

  return {
    workoutId: workoutId as string,
    name: workout.name,
    exerciseCount: workout.exercises.length,
    exercises: workout.exercises,
  };
}

// ── Parse LLM tool call output into a DraftWorkout ───────────────────────────
export function parseDraftWorkoutFromLLM(
  llmOutput: string,
  exerciseIndex: ExerciseEntry[],
): DraftWorkout | null {
  try {
    // Try to extract JSON from the LLM output
    const jsonMatch = llmOutput.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate structure
    if (!parsed.name || !Array.isArray(parsed.exercises)) return null;

    const resolvedExercises: DraftExercise[] = [];

    for (const ex of parsed.exercises) {
      const input = (ex.exercise_id as string) || (ex.name as string) || "";
      const resolvedId = resolveExerciseInput(input, exerciseIndex);
      if (!resolvedId) continue; // Skip unresolved exercises

      const sets = (ex.sets as Record<string, unknown>[] || []).map((s) => ({
        reps: Number(s.reps) || 5,
        weight: Number(s.weight) || 0,
        is_confirmed: false,
      }));

      if (sets.length === 0) {
        sets.push({ reps: 5, weight: 0, is_confirmed: false });
      }

      resolvedExercises.push({
        exercise_id: resolvedId,
        sets,
      });
    }

    if (resolvedExercises.length === 0) return null;

    return {
      name: parsed.name,
      exercises: resolvedExercises,
    };
  } catch {
    return null;
  }
}

// ── Main entry point: generate + create workout ─────────────────────────────
export async function generateAndCreateWorkout(
  supabase: SupabaseClient,
  userId: string,
  message: string,
  muscleGaps: MuscleGapContext | null,
  recentWorkouts: RecentWorkoutContext[],
  exerciseIndex: ExerciseEntry[],
): Promise<CreatedWorkoutResult> {
  const workoutType = extractWorkoutType(message);
  const draft = generateSmartWorkout(muscleGaps, recentWorkouts, exerciseIndex, workoutType ?? undefined);
  return createDraftWorkoutInDB(supabase, userId, draft);
}
