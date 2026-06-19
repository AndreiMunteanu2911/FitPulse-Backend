import { NextResponse } from "../../compat/next-server";
import { createSupabaseServerClient } from "../../helper/supabaseServer";
import { calculateWorkoutSummary } from "../../lib/workout-stats";

interface Set {
  weight: number;
  reps: number;
}

interface WorkoutExercise {
  sets?: Set[];
}

interface Workout {
  workout_date: string;
  workout_exercises?: WorkoutExercise[];
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Get all completed workouts
  const { data: workouts, error: workoutsError } = await supabase
    .from("workouts")
    .select("*, workout_exercises (*, sets (*))")
    .eq("user_id", user.id)
    .eq("status", "completed")
    .order("workout_date", { ascending: false });

  if (workoutsError) return NextResponse.json({ error: workoutsError.message }, { status: 500 });

  // Calculate stats
  const totalWorkouts = workouts.length;
  const workoutsThisWeek = workouts.filter(w => new Date(w.workout_date) >= weekAgo).length;
  const workoutsThisMonth = workouts.filter(w => new Date(w.workout_date) >= monthAgo).length;

  // Calculate volume (total weight * reps)
  let totalVolume = 0;
  let weekVolume = 0;
  workouts.forEach((workout: Workout) => {
    const isThisWeek = new Date(workout.workout_date) >= weekAgo;
    (workout.workout_exercises || []).forEach((we: WorkoutExercise) => {
      (we.sets || []).forEach((set: Set) => {
        const volume = set.weight * set.reps;
        totalVolume += volume;
        if (isThisWeek) weekVolume += volume;
      });
    });
  });

  // Calculate streak
  const uniqueDates: string[] = [...new Set(workouts.map(w => w.workout_date as string))].sort((a, b) => 
    new Date(b).getTime() - new Date(a).getTime()
  );
  
  let currentStreak = 0;
  let longestStreak = 0;
  
  if (uniqueDates.length > 0) {
    const todayStr = today.toISOString().split("T")[0];
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    
    if (uniqueDates[0] === todayStr || uniqueDates[0] === yesterday) {
      currentStreak = 1;
      for (let i = 1; i < uniqueDates.length; i++) {
        const prevDate = new Date(uniqueDates[i-1]);
        const currDate = new Date(uniqueDates[i]);
        const diff = (prevDate.getTime() - currDate.getTime()) / (24 * 60 * 60 * 1000);
        if (diff === 1) currentStreak++;
        else break;
      }
    }

    // Calculate longest streak
    let tempStreak = 1;
    for (let i = 1; i < uniqueDates.length; i++) {
      const prevDate = new Date(uniqueDates[i-1]);
      const currDate = new Date(uniqueDates[i]);
      const diff = (prevDate.getTime() - currDate.getTime()) / (24 * 60 * 60 * 1000);
      if (diff === 1) tempStreak++;
      else {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, tempStreak);
  }

  // Count PRs (personal records) - simplified: count unique exercises with max weight
  const exerciseMaxWeights = new Map<string, number>();
  workouts.forEach(workout => {
    (workout.workout_exercises || []).forEach((we: WorkoutExercise & { exercise_id?: string }) => {
      (we.sets || []).forEach(set => {
        const key = we.exercise_id || "";
        const current = exerciseMaxWeights.get(key) || 0;
        if (set.weight > current) exerciseMaxWeights.set(key, set.weight);
      });
    });
  });
  const prCount = exerciseMaxWeights.size;
  const sharedSummary = calculateWorkoutSummary(workouts as Workout[]);

  // Build weekly histogram (last 12 weeks)
  const weeklyHistogram: { weekLabel: string; count: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const weekStart = new Date(today.getTime() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
    const weekEnd   = new Date(today.getTime() - i       * 7 * 24 * 60 * 60 * 1000);
    const count = workouts.filter(w => {
      const d = new Date(w.workout_date);
      return d >= weekStart && d < weekEnd;
    }).length;
    // Label is the week-start date in "Mar 8" format for the x-axis
    const label = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    weeklyHistogram.push({ weekLabel: label, count });
  }

  return NextResponse.json({
    stats: {
      totalWorkouts,
      workoutsThisWeek,
      workoutsThisMonth,
      totalVolume: Math.round(sharedSummary.totalVolume),
      weekVolume: Math.round(weekVolume),
      currentStreak: sharedSummary.currentStreak,
      longestStreak: sharedSummary.longestStreak,
      prCount: sharedSummary.prCount,
      weeklyHistogram,
    }
  });
}
