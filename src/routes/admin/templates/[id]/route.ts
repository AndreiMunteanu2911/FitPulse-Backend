// ── Admin: Official Template Management (single template) ────────────────────
// PUT    /api/admin/templates/[id] — Update an official template
// DELETE /api/admin/templates/[id] — Delete an official template
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "../../../../compat/next-server";
import { requireAdmin } from "../../../../helper/supabaseServer";
import { resolveExercises } from "../../../../helper/resolveExercises";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const { supabase } = guard;

  const { id } = await params;
  const { name, description, exercises } = await req.json();

  if (!id) return NextResponse.json({ error: "Template ID is required" }, { status: 400 });

  // Update template (ensure it stays official)
  const { data: template, error: templateError } = await supabase
    .from("workout_templates")
    .update({ name, description, is_official: true, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (templateError) return NextResponse.json({ error: templateError.message }, { status: 500 });

  // Update exercises if provided
  if (exercises) {
    await supabase.from("template_exercises").delete().eq("template_id", id);

    if (exercises.length > 0) {
      const templateExercises = exercises.map((ex: { exercise_id: string }, index: number) => ({
        template_id: id,
        exercise_id: ex.exercise_id,
        order_index: index,
      }));

      const { error: exercisesError } = await supabase
        .from("template_exercises")
        .insert(templateExercises);

      if (exercisesError) return NextResponse.json({ error: exercisesError.message }, { status: 500 });
    }
  }

  const exerciseMap = await resolveExercises(supabase, exercises?.map((ex: { exercise_id: string }) => ex.exercise_id) ?? []);

  const enriched = {
    ...template,
    template_exercises: (exercises ?? []).map((ex: { exercise_id: string }, index: number) => ({
      ...ex,
      order_index: index,
      exercise: exerciseMap.get(ex.exercise_id) ?? { exercise_id: ex.exercise_id, name: ex.exercise_id, is_custom: false },
    })),
  };

  return NextResponse.json({ template: enriched });
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
    .from("workout_templates")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
