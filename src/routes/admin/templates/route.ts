// ── Admin: Official Template Management ──────────────────────────────────────
// POST /api/admin/templates — Create an official workout template
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "../../../compat/next-server";
import { requireAdmin } from "../../../helper/supabaseServer";
import { resolveExercises } from "../../../helper/resolveExercises";

interface TemplateExercise {
  exercise_id: string;
  order_index: number;
}

interface Template {
  template_exercises?: TemplateExercise[];
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const { supabase } = guard;

  const { name, description, exercises } = await req.json();

  if (!name) {
    return NextResponse.json({ error: "Template name is required" }, { status: 400 });
  }

  // Create template with is_official = true and user_id = admin user
  const { data: template, error: templateError } = await supabase
    .from("workout_templates")
    .insert({ user_id: (await supabase.auth.getUser()).data.user?.id, name, description, is_official: true })
    .select()
    .single();

  if (templateError) return NextResponse.json({ error: templateError.message }, { status: 500 });

  // Insert exercises
  if (exercises && exercises.length > 0) {
    const templateExercises = exercises.map((ex: { exercise_id: string }, index: number) => ({
      template_id: template.id,
      exercise_id: ex.exercise_id,
      order_index: index,
    }));

    const { error: exercisesError } = await supabase
      .from("template_exercises")
      .insert(templateExercises);

    if (exercisesError) {
      // Rollback: delete the template if exercises fail
      await supabase.from("workout_templates").delete().eq("id", template.id);
      return NextResponse.json({ error: exercisesError.message }, { status: 500 });
    }
  }

  // Resolve exercise names for response
  const allExerciseIds = exercises?.map((ex: { exercise_id: string }) => ex.exercise_id) ?? [];
  const exerciseMap = await resolveExercises(supabase, allExerciseIds);

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
