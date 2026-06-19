// ── Admin: Update Exercise Form Rules ────────────────────────────────────────
// PUT /api/admin/exercises/[id]/form-rules — Update form_rules JSONB column
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "../../../../../compat/next-server";
import { requireAdmin } from "../../../../../helper/supabaseServer";
import { exerciseFormRulesSchema } from "../../../../../lib/validations";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const { supabase } = guard;

  const { id } = await params;
  const body = await req.json();
  const { form_rules } = body;

  if (form_rules === undefined) {
    return NextResponse.json({ error: "form_rules is required" }, { status: 400 });
  }

  const parsed = exerciseFormRulesSchema.safeParse(form_rules);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid form_rules payload",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("exercises")
    .update({ form_rules: parsed.data })
    .eq("exercise_id", id)
    .select("exercise_id, name, form_rules")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ exercise: data });
}
