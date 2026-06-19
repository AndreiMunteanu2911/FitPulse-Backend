export interface WorkoutStatsSet {
  weight: number;
  reps: number;
}

export interface WorkoutStatsExercise {
  exercise_id?: string;
  sets?: WorkoutStatsSet[];
}

export interface WorkoutStatsRow {
  workout_date: string;
  workout_exercises?: WorkoutStatsExercise[];
}

const DAY_MS = 86_400_000;

function localDateKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function calculateWorkoutSummary(rows: WorkoutStatsRow[], now = new Date()) {
  let totalVolume = 0;
  const maxWeightByExercise = new Map<string, number>();

  for (const workout of rows) {
    for (const exercise of workout.workout_exercises ?? []) {
      for (const set of exercise.sets ?? []) {
        totalVolume += Number(set.weight || 0) * Number(set.reps || 0);
        if (exercise.exercise_id && set.weight > (maxWeightByExercise.get(exercise.exercise_id) ?? 0)) {
          maxWeightByExercise.set(exercise.exercise_id, set.weight);
        }
      }
    }
  }

  const dates = [...new Set(rows.map((row) => localDateKey(row.workout_date)))].sort().reverse();
  let longestStreak = 0;
  let run = 0;
  let previous: Date | null = null;

  for (const key of dates) {
    const current = new Date(`${key}T12:00:00`);
    run = previous && Math.round((previous.getTime() - current.getTime()) / DAY_MS) === 1 ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    previous = current;
  }

  let currentStreak = 0;
  if (dates.length) {
    const newest = new Date(`${dates[0]}T12:00:00`);
    const today = new Date(`${localDateKey(now)}T12:00:00`);
    const age = Math.round((today.getTime() - newest.getTime()) / DAY_MS);
    if (age <= 1) {
      currentStreak = 1;
      for (let index = 1; index < dates.length; index++) {
        const prior = new Date(`${dates[index - 1]}T12:00:00`);
        const current = new Date(`${dates[index]}T12:00:00`);
        if (Math.round((prior.getTime() - current.getTime()) / DAY_MS) !== 1) break;
        currentStreak++;
      }
    }
  }

  return {
    totalWorkouts: rows.length,
    totalVolume,
    prCount: maxWeightByExercise.size,
    currentStreak,
    longestStreak,
  };
}
