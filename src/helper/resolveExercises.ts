import type { SupabaseClient } from "@supabase/supabase-js";

export interface ExerciseInfo {
  exercise_id: string;
  name: string;
  gif_url?: string | null;
  target_muscles?: string[] | null;
  body_parts?: string[] | null;
  equipments?: string[] | null;
  is_custom: boolean;
  created_at?: string;
}

/**
 * Batch-resolves exercise metadata for a list of exercise IDs.
 * Standard exercises are fetched from the `exercises` table;
 * custom exercises (prefix "custom_") are fetched from `custom_exercises`.
 * Returns a Map from exercise_id → ExerciseInfo.
 */
export async function resolveExercises(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  exerciseIds: string[]
): Promise<Map<string, ExerciseInfo>> {
  const unique = [...new Set(exerciseIds)];
  const standardIds = unique.filter((id) => !id.startsWith("custom_"));
  const customIds = unique.filter((id) => id.startsWith("custom_"));

  const map = new Map<string, ExerciseInfo>();

  if (standardIds.length > 0) {
    const { data } = await supabase
      .from("exercises")
      .select("*")
      .in("exercise_id", standardIds);
    (data ?? []).forEach((e: Record<string, unknown>) => {
      map.set(e.exercise_id as string, { ...(e as unknown as ExerciseInfo), is_custom: false });
    });
  }

  if (customIds.length > 0) {
    const uuids = customIds.map((id) => id.replace("custom_", ""));
    const { data } = await supabase
      .from("custom_exercises")
      .select("*")
      .in("id", uuids);
    (data ?? []).forEach((e: Record<string, unknown>) => {
      map.set(`custom_${e.id}`, {
        exercise_id: `custom_${e.id as string}`,
        name: e.name as string,
        gif_url: null,
        target_muscles: null,
        body_parts: e.body_part ? [e.body_part as string] : null,
        equipments: null,
        is_custom: true,
        created_at: e.created_at as string,
      });
    });
  }

  return map;
}
