import { NextResponse } from "../../../../../compat/next-server";
import { requireAdmin } from "../../../../../helper/supabaseServer";

export async function PATCH() {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const { supabase } = guard;

  const { data, error } = await supabase.rpc("admin_mark_needs_review_form_rules_ai_generated");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const updatedExerciseIds = (data ?? []).map((row: { exercise_id: string }) => row.exercise_id);

  return NextResponse.json({
    updated_count: updatedExerciseIds.length,
    updated_exercise_ids: updatedExerciseIds,
  });
}
