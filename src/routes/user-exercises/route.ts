import { NextRequest, NextResponse } from "../../compat/next-server";
import { createSupabaseServerClient } from "../../helper/supabaseServer";
import { resolveExercises } from "../../helper/resolveExercises";

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const favoritesOnly = searchParams.get("favorites") === "true";
  const exerciseId = searchParams.get("exerciseId");

  let query = supabase
    .from("user_exercises")
    .select("*")
    .eq("user_id", user.id);

  if (favoritesOnly) query = query.eq("is_favorite", true);
  if (exerciseId) query = query.eq("exercise_id", exerciseId);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const exerciseIds = (data || []).map((ue: { exercise_id: string }) => ue.exercise_id);
  const exerciseMap = await resolveExercises(supabase, exerciseIds);

  const userExercises = (data || []).map((ue: { exercise_id: string }) => ({
    ...ue,
    exercise: exerciseMap.get(ue.exercise_id) ?? null,
  }));

  return NextResponse.json({ userExercises });
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { exercise_id, is_favorite = true } = await req.json();

  if (!exercise_id) {
    return NextResponse.json({ error: "Exercise ID is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("user_exercises")
    .upsert({ user_id: user.id, exercise_id, is_favorite }, { onConflict: "user_id,exercise_id" })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const exerciseMap = await resolveExercises(supabase, [exercise_id]);
  return NextResponse.json({ userExercise: { ...data, exercise: exerciseMap.get(exercise_id) ?? null } });
}

export async function PUT(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, exercise_id, is_favorite } = await req.json();

  if (!id) return NextResponse.json({ error: "User exercise ID is required" }, { status: 400 });

  const updateData: Record<string, unknown> = {};
  if (exercise_id !== undefined) updateData.exercise_id = exercise_id;
  if (is_favorite !== undefined) updateData.is_favorite = is_favorite;

  const { data, error } = await supabase
    .from("user_exercises")
    .update(updateData)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const resolvedId = data.exercise_id;
  const exerciseMap = await resolveExercises(supabase, [resolvedId]);
  return NextResponse.json({ userExercise: { ...data, exercise: exerciseMap.get(resolvedId) ?? null } });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ error: "User exercise ID is required" }, { status: 400 });

  const { error } = await supabase
    .from("user_exercises")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
