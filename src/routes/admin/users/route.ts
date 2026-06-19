// ── Admin: User Management ──────────────────────────────────────────────────
// GET /api/admin/users — List all users with stats
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "../../../compat/next-server";
import { requireAdmin } from "../../../helper/supabaseServer";

export async function GET() {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const { supabase } = guard;

  // Fetch user_stats with user info (via join)
  const { data: stats, error: statsError } = await supabase
    .from("user_stats")
    .select("user_id, display_name, total_xp, level, streak_freeze_count, role");

  if (statsError) return NextResponse.json({ error: statsError.message }, { status: 500 });

  // Fetch workout counts per user
  const { data: workouts } = await supabase
    .from("workouts")
    .select("user_id")
    .eq("status", "completed");

  const workoutCounts = new Map<string, number>();
  (workouts ?? []).forEach((w) => {
    workoutCounts.set(w.user_id, (workoutCounts.get(w.user_id) ?? 0) + 1);
  });

  // Enrich stats with workout counts
  const users = (stats ?? []).map((s) => ({
    user_id: s.user_id,
    display_name: s.display_name,
    total_xp: s.total_xp,
    level: s.level,
    streak_freeze_count: s.streak_freeze_count,
    role: s.role,
    workout_count: workoutCounts.get(s.user_id) ?? 0,
  }));

  return NextResponse.json({ users });
}
