import { NextResponse } from "../../../compat/next-server";
import { createSupabaseServerClient } from "../../../helper/supabaseServer";
import { resolveExercises } from "../../../helper/resolveExercises";
import { createDraftWorkoutInDB, type DraftExercise, type DraftWorkout } from "../../../lib/workout-generator";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("workouts")
    .select(`*, workout_exercises (*, sets (*))`)
    .eq("user_id", user.id)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ workout: null });

  const exerciseIds = (data.workout_exercises ?? []).map(
    (we: { exercise_id: string }) => we.exercise_id
  );
  const exerciseMap = await resolveExercises(supabase, exerciseIds);

  const workout = {
    ...data,
    workout_exercises: (data.workout_exercises ?? [])
      .sort((a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index)
      .map((we: { exercise_id: string; sets: { set_number: number }[] }) => ({
        ...we,
        exercise: exerciseMap.get(we.exercise_id) ?? {
          exercise_id: we.exercise_id,
          name: we.exercise_id,
          is_custom: false,
        },
        sets: (we.sets ?? []).sort((a, b) => a.set_number - b.set_number),
      })),
  };

  return NextResponse.json({ workout });
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" && body.name.trim()
    ? body.name.trim()
    : "AI Workout";
  const exercises = Array.isArray(body?.exercises) ? body.exercises : [];

  const draft: DraftWorkout = {
    name,
    exercises: exercises
      .map((exercise: Record<string, unknown>): DraftExercise => {
        const exerciseId = typeof exercise.exerciseId === "string"
          ? exercise.exerciseId
          : typeof exercise.exercise_id === "string"
            ? exercise.exercise_id
            : "";

        const sets = Array.isArray(exercise.sets) ? exercise.sets : [];
        return {
          exercise_id: exerciseId,
          sets: sets.map((set: Record<string, unknown>) => ({
            reps: Number(set.reps) || 5,
            weight: Number(set.weight) || 0,
            is_confirmed: false,
          })),
        };
      })
      .filter((exercise: DraftExercise) => exercise.exercise_id && exercise.sets.length > 0),
  };

  if (draft.exercises.length === 0) {
    return NextResponse.json({ error: "Workout must include at least one exercise" }, { status: 400 });
  }

  try {
    const result = await createDraftWorkoutInDB(supabase, user.id, draft);
    return NextResponse.json({ workout: { id: result.workoutId, name: result.name } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create draft workout" },
      { status: 500 },
    );
  }
}
