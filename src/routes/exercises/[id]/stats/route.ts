import { NextRequest, NextResponse } from "../../../../compat/next-server";
import { createSupabaseServerClient } from "../../../../helper/supabaseServer";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: exerciseId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch all completed workouts containing this exercise, including their sets
  const { data, error } = await supabase
    .from("workouts")
    .select(
      `id, workout_date, workout_exercises!inner(exercise_id, sets(reps, weight))`
    )
    .eq("user_id", user.id)
    .eq("status", "completed")
    .eq("workout_exercises.exercise_id", exerciseId)
    .order("workout_date", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Aggregate per workout session
  interface RawSet { reps: number; weight: number }
  interface RawWorkoutExercise { exercise_id: string; sets: RawSet[] }
  interface RawWorkout { id: string; workout_date: string; workout_exercises: RawWorkoutExercise[] }

  const history = (data as RawWorkout[])
    .map((workout) => {
      const allSets: RawSet[] = workout.workout_exercises.flatMap((we) => we.sets || []);
      if (allSets.length === 0) return null;

      const maxWeight = Math.max(...allSets.map((s) => s.weight));
      const maxReps = Math.max(...allSets.map((s) => s.reps));
      const volume = allSets.reduce((sum, s) => sum + s.weight * s.reps, 0);

      return {
        workout_date: workout.workout_date,
        max_weight: maxWeight,
        max_reps: maxReps,
        volume: Math.round(volume * 10) / 10,
      };
    })
    .filter(Boolean);

  return NextResponse.json({ history });
}
