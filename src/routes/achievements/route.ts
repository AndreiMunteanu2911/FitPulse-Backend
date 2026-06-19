import { NextResponse } from "../../compat/next-server";
import { createSupabaseServerClient } from "../../helper/supabaseServer";
import {
  ACHIEVEMENT_DEFINITIONS,
  checkUnlockCondition,
  xpForLevel,
  xpProgress,
} from "../../lib/gamification";
import { calculateWorkoutSummary } from "../../lib/workout-stats";

interface SetRow { weight: number; reps: number }
interface WorkoutExerciseRow { exercise_id?: string; sets?: SetRow[] }
interface WorkoutRow { workout_date: string; workout_exercises?: WorkoutExerciseRow[] }
interface UserAchievementRow { achievement_id: string; unlocked_at: string }

function buildWorkoutSummary(rows: WorkoutRow[]) {
  const summary = calculateWorkoutSummary(rows);
  return {
    totalWorkouts: summary.totalWorkouts,
    prCount: summary.prCount,
    longestStreak: summary.longestStreak,
    totalVolume: summary.totalVolume,
  };
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: workouts, error: workoutError } = await supabase
    .from("workouts")
    .select("workout_date, workout_exercises (exercise_id, sets (weight, reps))")
    .eq("user_id", user.id)
    .eq("status", "completed");

  if (workoutError) return NextResponse.json({ error: workoutError.message }, { status: 500 });

  const { data: claimedRows, error: claimedError } = await supabase
    .from("user_achievements")
    .select("achievement_id, unlocked_at")
    .eq("user_id", user.id);

  if (claimedError) return NextResponse.json({ error: claimedError.message }, { status: 500 });

  const summary = buildWorkoutSummary((workouts ?? []) as WorkoutRow[]);
  const claimedMap = new Map<string, string>(
    ((claimedRows ?? []) as UserAchievementRow[]).map((row) => [row.achievement_id, row.unlocked_at]),
  );

  const achievements = ACHIEVEMENT_DEFINITIONS.map((definition) => {
    const claimedAt = claimedMap.get(definition.id) ?? null;
    const conditionMet = checkUnlockCondition(definition.id, summary);
    return {
      ...definition,
      unlockedAt: conditionMet ? (claimedAt ?? new Date().toISOString()) : null,
      claimedAt,
    };
  });

  return NextResponse.json({ achievements });
}

/**
 * POST /api/achievements
 * Body: { achievementId: string }
 *
 * Claims an achievement:
 *  1. Validates the achievement ID and verifies conditions are met
 *  2. Inserts a row into user_achievements (unique constraint prevents double-claim)
 *  3. Reads current user_stats.total_xp then upserts with total_xp += xp_reward
 *  4. Returns the full updated XP stats so the page can update in-place
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let achievementId: string;
  try {
    ({ achievementId } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const definition = ACHIEVEMENT_DEFINITIONS.find((a) => a.id === achievementId);
  if (!definition) {
    return NextResponse.json({ error: "Unknown achievement" }, { status: 404 });
  }

  const { data: workouts, error: wErr } = await supabase
    .from("workouts")
    .select("workout_date, workout_exercises (exercise_id, sets (weight, reps))")
    .eq("user_id", user.id)
    .eq("status", "completed");

  if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 });

  const summary = buildWorkoutSummary((workouts ?? []) as WorkoutRow[]);

  if (!checkUnlockCondition(achievementId, summary)) {
    return NextResponse.json({ error: "Achievement conditions not yet met" }, { status: 403 });
  }

  const { data: claimRows, error: claimError } = await supabase.rpc("claim_achievement", {
    p_achievement_id: achievementId,
    p_xp_reward: definition.xpReward,
  });

  if (claimError) {
    if (claimError.code === "23505") {
      return NextResponse.json({ error: "Achievement already claimed" }, { status: 409 });
    }
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }

  const claim = Array.isArray(claimRows) ? claimRows[0] : claimRows;
  if (!claim) return NextResponse.json({ error: "Achievement claim returned no result" }, { status: 500 });
  const unlockedAt = claim.claimed_at as string;
  const newTotalXP = Number(claim.total_xp);
  const newLevel = Number(claim.level);

  return NextResponse.json({
    success: true,
    achievementId,
    claimedAt: unlockedAt,
    xpEarned: definition.xpReward,
    totalXP: newTotalXP,
    level: newLevel,
    xpForCurrentLevel: xpForLevel(newLevel),
    xpForNextLevel: xpForLevel(newLevel + 1),
    xpProgress: xpProgress(newTotalXP),
  });
}
