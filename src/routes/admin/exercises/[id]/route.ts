// ── Admin: Exercise Management (single exercise) ────────────────────────────
// PUT    /api/admin/exercises/[id] — Update a standard exercise
// DELETE /api/admin/exercises/[id] — Delete a standard exercise
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "../../../../compat/next-server";
import { requireAdmin } from "../../../../helper/supabaseServer";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const { supabase } = guard;

  const { id } = await params;
  const body = await req.json();

  const { data, error } = await supabase
    .from("exercises")
    .update(body)
    .eq("exercise_id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ exercise: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const { supabase } = guard;

  const { id } = await params;

  const { error } = await supabase
    .from("exercises")
    .delete()
    .eq("exercise_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
