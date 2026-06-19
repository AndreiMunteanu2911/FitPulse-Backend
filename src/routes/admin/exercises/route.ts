// ── Admin: Exercise Management ──────────────────────────────────────────────
// POST /api/admin/exercises — Insert a standard exercise
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "../../../compat/next-server";
import { requireAdmin } from "../../../helper/supabaseServer";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const { supabase } = guard;

  const searchParams = req.nextUrl.searchParams;
  const requestedLimit = Number.parseInt(searchParams.get("limit") ?? "100", 10);
  const requestedOffset = Number.parseInt(searchParams.get("offset") ?? "0", 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 100;
  const offset = Number.isFinite(requestedOffset) ? Math.max(requestedOffset, 0) : 0;

  const { data, error, count } = await supabase
    .from("exercises")
    .select("exercise_id, name, target_muscles, body_parts, equipments, instructions, form_rules", { count: "exact" })
    .not("exercise_id", "like", "custom_%")
    .order("name")
    .range(offset, offset + limit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const exercises = (data ?? []).map((exercise: { name?: string }) => ({
    ...exercise,
    name: exercise.name ? exercise.name.charAt(0).toUpperCase() + exercise.name.slice(1) : exercise.name,
  }));
  const totalCount = count ?? exercises.length;

  return NextResponse.json({
    exercises,
    total_count: totalCount,
    has_more: offset + exercises.length < totalCount,
    offset,
    limit,
  });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const { supabase } = guard;

  const body = await req.json();
  const { exercise_id, name, gif_url, target_muscles, body_parts, equipments } = body;

  if (!exercise_id || !name) {
    return NextResponse.json({ error: "exercise_id and name are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("exercises")
    .insert({ exercise_id, name, gif_url: gif_url ?? null, target_muscles: target_muscles ?? null, body_parts: body_parts ?? null, equipments: equipments ?? null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ exercise: data });
}
