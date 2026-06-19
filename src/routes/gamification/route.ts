import { NextResponse } from "../../compat/next-server";
import { createSupabaseServerClient } from "../../helper/supabaseServer";
import {
  ACHIEVEMENT_DEFINITIONS,
  checkUnlockCondition,
  levelFromXP,
  xpForLevel,
  xpProgress,
} from "../../lib/gamification";
import { calculateWorkoutSummary } from "../../lib/workout-stats";

interface SetRow { weight: number; reps: number }
interface WorkoutExerciseRow { exercise_id?: string; sets?: SetRow[] }
interface WorkoutRow { workout_date: string; workout_exercises?: WorkoutExerciseRow[] }
interface UserAchievementRow { achievement_id: string; unlocked_at: string }
interface UserStatsRow { total_xp: number; level: number }

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── 1. Fetch completed workouts (needed to compute conditions + currentStreak)
  const { data: workouts, error } = await supabase
    .from("workouts")
    .select("workout_date, workout_exercises (exercise_id, sets (weight, reps))")
    .eq("user_id", user.id)
    .eq("status", "completed")
    .order("workout_date", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (workouts ?? []) as WorkoutRow[];

  // Volume & PR count
  let totalVolume = 0;
  const exerciseMaxWeights = new Map<string, number>();
  rows.forEach((w) => {
    (w.workout_exercises ?? []).forEach((we) => {
      (we.sets ?? []).forEach((s) => {
        totalVolume += s.weight * s.reps;
        if (we.exercise_id) {
          const prev = exerciseMaxWeights.get(we.exercise_id) ?? 0;
          if (s.weight > prev) exerciseMaxWeights.set(we.exercise_id, s.weight);
        }
      });
    });
  });
  const prCount = exerciseMaxWeights.size;

  // Streak calculation
  const MS_PER_DAY = 86_400_000;
  const uniqueDates: string[] = [
    ...new Set(rows.map((w) => w.workout_date)),
  ].sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  let longestStreak  = 0;
  let currentStreak  = 0;

  if (uniqueDates.length > 0) {
    const todayStr     = new Date().toISOString().split("T")[0];
    const yesterdayStr = new Date(Date.now() - MS_PER_DAY).toISOString().split("T")[0];
    if (uniqueDates[0] === todayStr || uniqueDates[0] === yesterdayStr) {
      currentStreak = 1;
      for (let i = 1; i < uniqueDates.length; i++) {
        const diff = (new Date(uniqueDates[i - 1]).getTime() - new Date(uniqueDates[i]).getTime()) / MS_PER_DAY;
        if (diff === 1) currentStreak++;
        else break;
      }
    }
    let temp = 1;
    for (let i = 1; i < uniqueDates.length; i++) {
      const diff = (new Date(uniqueDates[i - 1]).getTime() - new Date(uniqueDates[i]).getTime()) / MS_PER_DAY;
      if (diff === 1) { temp++; }
      else { longestStreak = Math.max(longestStreak, temp); temp = 1; }
    }
    longestStreak = Math.max(longestStreak, temp);
  }

  const calculated = calculateWorkoutSummary(rows);
  const summary = {
    totalWorkouts: calculated.totalWorkouts,
    prCount: calculated.prCount,
    longestStreak: calculated.longestStreak,
    totalVolume: calculated.totalVolume,
  };

  // ── 2. Read user_stats from DB (total_xp is the authoritative source of truth)
  const { data: statsRow } = await supabase
    .from("user_stats")
    .select("total_xp, level")
    .eq("user_id", user.id)
    .single();

  const totalXP = (statsRow as UserStatsRow | null)?.total_xp ?? 0;
  const level   = levelFromXP(totalXP);

  // ── 3. Read which achievements the user has already claimed (from user_achievements)
  const { data: claimedRows } = await supabase
    .from("user_achievements")
    .select("achievement_id, unlocked_at")
    .eq("user_id", user.id);

  const claimedMap = new Map<string, string>(
    (claimedRows as UserAchievementRow[] ?? []).map((r) => [r.achievement_id, r.unlocked_at]),
  );

  // ── 4. Build achievement list
  //   unlockedAt: non-null when workout conditions are currently met (shows Claim button)
  //   claimedAt:  non-null when the row exists in user_achievements (XP already banked)
  const achievements = ACHIEVEMENT_DEFINITIONS.map((def) => {
    const conditionMet = checkUnlockCondition(def.id, summary);
    const claimedAt    = claimedMap.get(def.id) ?? null;
    return {
      ...def,
      unlockedAt: conditionMet ? (claimedAt ?? new Date().toISOString()) : null,
      claimedAt,
    };
  });

  return NextResponse.json({
    gamification: {
      totalXP,
      level,
      xpForCurrentLevel: xpForLevel(level),
      xpForNextLevel:    xpForLevel(level + 1),
      xpProgress:        xpProgress(totalXP),
      achievements,
      currentStreak: calculated.currentStreak,
    },
  });
}
