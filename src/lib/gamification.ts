// ── XP / Level maths ─────────────────────────────────────────────────────────
// Thresholds: xpForLevel(n) = (n-1)² × 50
//   L1:     0 XP   → L2 at    50 XP
//   L2:    50 XP   → L3 at   200 XP
//   L3:   200 XP   → L4 at   450 XP
//   L5:   800 XP   → L6 at  1250 XP
export function levelFromXP(xp: number): number {
  return Math.floor(Math.sqrt(xp / 50)) + 1;
}

/** XP required to reach `level` (cumulative from 0). */
export function xpForLevel(level: number): number {
  const n = level - 1;
  return n * n * 50;
}

/** 0–100 progress percentage through the current level. */
export function xpProgress(xp: number): number {
  const level = levelFromXP(xp);
  const start = xpForLevel(level);
  const end   = xpForLevel(level + 1);
  return Math.min(100, Math.round(((xp - start) / (end - start)) * 100));
}


// ── Achievement definitions ───────────────────────────────────────────────────
// These mirror the `achievements` catalogue table seeded in schema.sql.
// `icon` is a Lucide component name — rendered in the UI via a lookup map.
export const ACHIEVEMENT_DEFINITIONS = [
  { id: "first_workout",  name: "First Step",       description: "Complete your first workout",         icon: "Dumbbell",            xpReward:   50, category: "workouts" },
  { id: "workouts_5",     name: "Warm Up",           description: "Complete 5 workouts",                icon: "Activity",            xpReward:  100, category: "workouts" },
  { id: "workouts_10",    name: "Getting Serious",   description: "Complete 10 workouts",               icon: "TrendingUp",          xpReward:  200, category: "workouts" },
  { id: "workouts_25",    name: "Dedicated",         description: "Complete 25 workouts",               icon: "Star",                xpReward:  300, category: "workouts" },
  { id: "workouts_100",   name: "Century Club",      description: "Complete 100 workouts",              icon: "Award",               xpReward: 1000, category: "workouts" },
  { id: "streak_3",       name: "Hat Trick",         description: "Maintain a 3-day workout streak",    icon: "Zap",                 xpReward:   75, category: "streaks"  },
  { id: "streak_7",       name: "On Fire",           description: "Maintain a 7-day workout streak",    icon: "Flame",               xpReward:  150, category: "streaks"  },
  { id: "streak_30",      name: "Unstoppable",       description: "Maintain a 30-day workout streak",   icon: "Rocket",              xpReward:  500, category: "streaks"  },
  { id: "pr_1",           name: "Record Setter",     description: "Set your first personal record",     icon: "Trophy",              xpReward:   75, category: "records"  },
  { id: "pr_5",           name: "PR Crusher",        description: "Set 5 personal records",             icon: "Target",              xpReward:  150, category: "records"  },
  { id: "pr_10",          name: "Record Breaker",    description: "Set 10 personal records",            icon: "Medal",               xpReward:  300, category: "records"  },
  { id: "volume_10k",     name: "Iron Starter",      description: "Lift 10,000 kg total volume",        icon: "BarChart2",           xpReward:  100, category: "volume"   },
  { id: "volume_50k",     name: "Heavy Lifter",      description: "Lift 50,000 kg total volume",        icon: "ChartBarIncreasing",  xpReward:  250, category: "volume"   },
  { id: "volume_100k",    name: "Volume King",       description: "Lift 100,000 kg total volume",       icon: "Crown",               xpReward:  500, category: "volume"   },
] as const;

// ── Achievement unlock condition check ────────────────────────────────────────
export interface WorkoutSummary {
  totalWorkouts: number;
  prCount:       number;
  longestStreak: number;
  totalVolume:   number;
}

/** Returns true if the achievement's unlock conditions are currently met. */
export function checkUnlockCondition(id: string, summary: WorkoutSummary): boolean {
  const { totalWorkouts, prCount, longestStreak, totalVolume } = summary;
  switch (id) {
    case "first_workout":  return totalWorkouts >= 1;
    case "workouts_5":     return totalWorkouts >= 5;
    case "workouts_10":    return totalWorkouts >= 10;
    case "workouts_25":    return totalWorkouts >= 25;
    case "workouts_100":   return totalWorkouts >= 100;
    case "streak_3":       return longestStreak >= 3;
    case "streak_7":       return longestStreak >= 7;
    case "streak_30":      return longestStreak >= 30;
    case "pr_1":           return prCount >= 1;
    case "pr_5":           return prCount >= 5;
    case "pr_10":          return prCount >= 10;
    case "volume_10k":     return totalVolume >= 10000;
    case "volume_50k":     return totalVolume >= 50000;
    case "volume_100k":    return totalVolume >= 100000;
    default:               return false;
  }
}

