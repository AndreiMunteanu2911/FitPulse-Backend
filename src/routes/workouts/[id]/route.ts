import { NextRequest, NextResponse } from "../../../compat/next-server";
import { createSupabaseServerClient } from "../../../helper/supabaseServer";
import { resolveExercises } from "../../../helper/resolveExercises";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("workouts")
    .select(`*, workout_exercises (*, sets (*))`)
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Workout not found" }, { status: 404 });

  const exerciseIds = (data.workout_exercises ?? []).map(
    (we: { exercise_id: string }) => we.exercise_id
  );
  const exerciseMap = await resolveExercises(supabase, exerciseIds);

  data.workout_exercises = (data.workout_exercises ?? [])
    .sort((a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index)
    .map((we: { exercise_id: string; sets: { set_number: number }[] }) => ({
      ...we,
      exercise: exerciseMap.get(we.exercise_id) ?? {
        exercise_id: we.exercise_id,
        name: we.exercise_id,
        is_custom: false,
      },
      sets: (we.sets ?? []).sort((a, b) => a.set_number - b.set_number),
    }));

  return NextResponse.json({ workout: data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (body.status === "completed") {
    const { error } = await supabase.rpc("finish_workout", { p_workout_id: id });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }
  const updates: { name?: string; status?: string; finished_at?: string } = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.status !== undefined) {
    updates.status = body.status;
  }

  const { error } = await supabase
    .from("workouts")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("workouts")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
