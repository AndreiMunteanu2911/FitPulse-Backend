// ── Admin: List All Exercises (with form_rules) ─────────────────────────────
// GET /api/admin/exercises — Fetch all standard exercises for form rules review
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "../../../../compat/next-server";
import { requireAdmin } from "../../../../helper/supabaseServer";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const { supabase } = guard;

  const searchParams = req.nextUrl.searchParams;
  const requestedLimit = Number.parseInt(searchParams.get("limit") ?? "100", 10);
  const requestedOffset = Number.parseInt(searchParams.get("offset") ?? "0", 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 100;
  const offset = Number.isFinite(requestedOffset) ? Math.max(requestedOffset, 0) : 0;

  const query = supabase
    .from("exercises")
    .select("exercise_id, name, target_muscles, body_parts, equipments, instructions, form_rules", { count: "exact" })
    .not("exercise_id", "like", "custom_%")
    .order("name")
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Capitalize names
  const exercises = (data ?? []).map((e: { name?: string }) => ({
    ...e,
    name: e.name ? e.name.charAt(0).toUpperCase() + e.name.slice(1) : e.name,
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
