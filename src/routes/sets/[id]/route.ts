import { NextRequest, NextResponse } from "../../../compat/next-server";
import { createSupabaseServerClient } from "../../../helper/supabaseServer";
import { setMutationSchema } from "../../../lib/validations";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

// Verify that a set belongs to the authenticated user's workout.
// Uses three sequential queries (no nested joins) to avoid PostgREST join limitations.
async function verifySetOwnership(
  supabase: SupabaseServerClient,
  userId: string,
  setId: string
): Promise<boolean> {
  // 1. Find the set
  const { data: setRow } = await supabase
    .from("sets")
    .select("workout_exercise_id")
    .eq("id", setId)
    .maybeSingle();

  if (!setRow) return false;

  // 2. Find the workout_exercise
  const { data: weRow } = await supabase
    .from("workout_exercises")
    .select("workout_id")
    .eq("id", setRow.workout_exercise_id)
    .maybeSingle();

  if (!weRow) return false;

  // 3. Check the workout belongs to this user
  const { data: workoutRow } = await supabase
    .from("workouts")
    .select("id")
    .eq("id", weRow.workout_id)
    .eq("user_id", userId)
    .maybeSingle();

  return !!workoutRow;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const owned = await verifySetOwnership(supabase, user.id, id);
  if (!owned) return NextResponse.json({ error: "Set not found or unauthorized" }, { status: 404 });

  const parsed = setMutationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid set values" }, { status: 400 });
  const body = parsed.data;
  const updates: { reps?: number; weight?: number; is_confirmed?: boolean } = {};
  if (body.reps !== undefined) updates.reps = body.reps;
  if (body.weight !== undefined) updates.weight = body.weight;
  if (body.is_confirmed !== undefined) updates.is_confirmed = body.is_confirmed;

  const { error } = await supabase.from("sets").update(updates).eq("id", id);
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

  const owned = await verifySetOwnership(supabase, user.id, id);
  if (!owned) return NextResponse.json({ error: "Set not found or unauthorized" }, { status: 404 });

  const { error } = await supabase.from("sets").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
