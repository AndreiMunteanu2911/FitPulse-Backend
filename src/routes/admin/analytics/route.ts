// ── Admin: Platform Analytics ───────────────────────────────────────────────
// GET /api/admin/analytics — Platform-wide stats and metrics
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "../../../compat/next-server";
import { requireAdmin } from "../../../helper/supabaseServer";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const { supabase } = guard;

  const { searchParams } = new URL(req.url);
  const requestedDays = Number.parseInt(searchParams.get("days") ?? "30", 10);
  const days = Number.isFinite(requestedDays) ? Math.min(Math.max(requestedDays, 1), 365) : 30;

  const since = new Date();
  since.setDate(since.getDate() - days);

  // 1. Total users
  const { count: totalUsers } = await supabase
    .from("user_stats")
    .select("*", { count: "exact", head: true });

  // 2. Active users (logged a workout in the last N days)
  const { data: activeUserIds } = await supabase
    .from("workouts")
    .select("user_id")
    .eq("status", "completed")
    .gte("workout_date", since.toISOString().split("T")[0]);

  const activeUsers = new Set((activeUserIds ?? []).map((w) => w.user_id)).size;

  // 3. Total workouts
  const { count: totalWorkouts } = await supabase
    .from("workouts")
    .select("*", { count: "exact", head: true });

  // 4. Total workouts in last N days
  const { count: recentWorkouts } = await supabase
    .from("workouts")
    .select("*", { count: "exact", head: true })
    .gte("workout_date", since.toISOString().split("T")[0]);

  // 5. Total sets
  const { count: totalSets } = await supabase
    .from("sets")
    .select("*", { count: "exact", head: true });

  // 6. Top 10 most used exercises
  const { data: topExercises } = await supabase
    .from("workout_exercises")
    .select("exercise_id")
    .limit(1000);

  const exerciseCounts = new Map<string, number>();
  (topExercises ?? []).forEach((we) => {
    exerciseCounts.set(we.exercise_id, (exerciseCounts.get(we.exercise_id) ?? 0) + 1);
  });

  const topExerciseCounts = [...exerciseCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const topExerciseIds = topExerciseCounts.map(([exerciseId]) => exerciseId);
  const { data: exerciseNames } = topExerciseIds.length > 0
    ? await supabase
        .from("exercises")
        .select("exercise_id, name")
        .in("exercise_id", topExerciseIds)
    : { data: [] };
  const exerciseNameMap = new Map(
    (exerciseNames ?? []).map((exercise) => [exercise.exercise_id, exercise.name]),
  );
  const topExercisesList = topExerciseCounts.map(([exercise_id, count]) => ({
    exercise_id,
    name: exerciseNameMap.get(exercise_id) ?? "Unknown exercise",
    count,
  }));

  // 7. Daily workout counts for chart
  const { data: dailyWorkouts } = await supabase
    .from("workouts")
    .select("workout_date")
    .eq("status", "completed")
    .gte("workout_date", since.toISOString().split("T")[0])
    .order("workout_date", { ascending: true });

  const dailyMap = new Map<string, number>();
  (dailyWorkouts ?? []).forEach((w) => {
    dailyMap.set(w.workout_date, (dailyMap.get(w.workout_date) ?? 0) + 1);
  });

  const dailyData = Array.from({ length: days }, (_, i) => {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    return { date: dateStr, count: dailyMap.get(dateStr) ?? 0 };
  });

  // 8. Total volume (last N days)
  const { data: recentSets } = await supabase
    .from("sets")
    .select("workout_exercise_id, weight, reps");

  let recentVolume = 0;
  (recentSets ?? []).forEach((s) => {
    recentVolume += s.weight * s.reps;
  });

  return NextResponse.json({
    analytics: {
      totalUsers: totalUsers ?? 0,
      activeUsers,
      totalWorkouts: totalWorkouts ?? 0,
      recentWorkouts: recentWorkouts ?? 0,
      totalSets: totalSets ?? 0,
      recentVolume: Math.round(recentVolume * 10) / 10,
      topExercises: topExercisesList,
      dailyWorkouts: dailyData,
    },
  });
}
