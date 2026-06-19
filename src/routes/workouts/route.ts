import { NextRequest, NextResponse } from "../../compat/next-server";
import { createSupabaseServerClient } from "../../helper/supabaseServer";
import { resolveExercises } from "../../helper/resolveExercises";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("workouts")
    .select(`*, workout_exercises (*, sets (*))`)
    .eq("user_id", user.id)
    .eq("status", "completed")
    .order("workout_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Collect all unique exercise IDs across all workouts for a single batch lookup
  const allExerciseIds = [
    ...new Set(
      (data ?? []).flatMap((w) =>
        (w.workout_exercises ?? []).map((we: { exercise_id: string }) => we.exercise_id)
      )
    ),
  ];
  const exerciseMap = await resolveExercises(supabase, allExerciseIds);

  const processed = (data ?? []).map((workout) => ({
    ...workout,
    workout_exercises: (workout.workout_exercises ?? [])
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
  }));

  return NextResponse.json({ workouts: processed });
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await req.json();
  const { data, error } = await supabase
    .from("workouts")
    .insert({
      user_id: user.id,
      workout_date: new Date().toISOString().split("T")[0],
      name: name ?? "My Workout",
      status: "draft",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ workout: data });
}
