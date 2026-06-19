import { NextRequest, NextResponse } from "../../../../compat/next-server";
import { createSupabaseServerClient } from "../../../../helper/supabaseServer";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: exerciseId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Find the most recent completed workout_exercise for this exercise/user
  const { data, error } = await supabase
    .from("workout_exercises")
    .select(`id, sets (*), workouts!inner (id, user_id, status, workout_date)`)
    .eq("exercise_id", exerciseId)
    .eq("workouts.user_id", user.id)
    .eq("workouts.status", "completed")
    .order("workout_date", { referencedTable: "workouts", ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ sets: [] });

  const sortedSets = ((data.sets ?? []) as { set_number: number; reps: number; weight: number }[])
    .sort((a, b) => a.set_number - b.set_number)
    .map(({ reps, weight }) => ({ reps, weight }));

  return NextResponse.json({ sets: sortedSets });
}
