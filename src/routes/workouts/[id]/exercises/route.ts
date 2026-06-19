import { NextRequest, NextResponse } from "../../../../compat/next-server";
import { createSupabaseServerClient } from "../../../../helper/supabaseServer";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: workoutId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify the workout belongs to the user
  const { data: workoutData } = await supabase
    .from("workouts")
    .select("id")
    .eq("id", workoutId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!workoutData) {
    return NextResponse.json({ error: "Workout not found or unauthorized" }, { status: 404 });
  }

  const { exercise_id, order_index } = await req.json();

  const { data: workoutExerciseData, error: exerciseError } = await supabase
    .from("workout_exercises")
    .insert({ workout_id: workoutId, exercise_id, order_index })
    .select()
    .single();

  if (exerciseError) return NextResponse.json({ error: exerciseError.message }, { status: 500 });

  const { data: setData, error: setError } = await supabase
    .from("sets")
    .insert({ workout_exercise_id: workoutExerciseData.id, set_number: 1, reps: 0, weight: 0, is_confirmed: false })
    .select()
    .single();

  if (setError) return NextResponse.json({ error: setError.message }, { status: 500 });

  return NextResponse.json({ workoutExercise: workoutExerciseData, set: setData });
}
