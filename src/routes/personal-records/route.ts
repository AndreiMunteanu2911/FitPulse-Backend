import { NextRequest, NextResponse } from "../../compat/next-server";
import { createSupabaseServerClient } from "../../helper/supabaseServer";
import { resolveExercises } from "../../helper/resolveExercises";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("personal_records")
    .select("*")
    .eq("user_id", user.id)
    .order("workout_date", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const exerciseIds = (data || []).map((r: { exercise_id: string }) => r.exercise_id);
  const exerciseMap = await resolveExercises(supabase, exerciseIds);

  const records = (data || []).map((r: { exercise_id: string }) => ({
    ...r,
    exercise: exerciseMap.get(r.exercise_id) ?? null,
  }));

  return NextResponse.json({ records });
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { exercise_id, max_weight, max_reps, workout_date } = await req.json();

  if (!exercise_id || !workout_date) {
    return NextResponse.json({ error: "Exercise ID and workout date are required" }, { status: 400 });
  }

  // Check if a record already exists for this user and exercise
  const { data: existing } = await supabase
    .from("personal_records")
    .select("*")
    .eq("user_id", user.id)
    .eq("exercise_id", exercise_id)
    .single();

  let data, error;
  if (existing) {
    // Update existing record if new values are better
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (max_weight > existing.max_weight) updateData.max_weight = max_weight;
    if (max_reps > existing.max_reps) updateData.max_reps = max_reps;
    if (new Date(workout_date) > new Date(existing.workout_date)) updateData.workout_date = workout_date;

    ({ data, error } = await supabase
      .from("personal_records")
      .update(updateData)
      .eq("id", existing.id)
      .select()
      .single());
  } else {
    // Create new record
    ({ data, error } = await supabase
      .from("personal_records")
      .insert({
        user_id: user.id,
        exercise_id,
        max_weight: max_weight || 0,
        max_reps: max_reps || 0,
        workout_date,
      })
      .select()
      .single());
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ record: data });
}

export async function PUT(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, max_weight, max_reps, workout_date } = await req.json();

  if (!id) return NextResponse.json({ error: "Record ID is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("personal_records")
    .update({
      max_weight,
      max_reps,
      workout_date,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ record: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ error: "Record ID is required" }, { status: 400 });

  const { error } = await supabase
    .from("personal_records")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
