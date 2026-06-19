import { NextRequest, NextResponse } from "../../../../compat/next-server";
import { z } from "zod";
import { requireUser } from "../../../../helper/supabaseServer";

const batchWorkoutSchema = z.object({
  name: z.string().trim().min(1).max(100),
  sets: z.array(z.object({
    id: z.string().uuid(),
    reps: z.number().int().min(0).max(1000),
    weight: z.number().min(0).max(100000),
    is_confirmed: z.boolean().optional(),
  })).max(500),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireUser();
  if ("error" in guard) return guard.error;
  const { supabase } = guard;
  const { id } = await params;
  const parsed = batchWorkoutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid workout state" }, { status: 400 });

  const { error } = await supabase.rpc("save_workout_state", {
    p_workout_id: id,
    p_name: parsed.data.name,
    p_sets: parsed.data.sets,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
