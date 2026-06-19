-- =============================================================================
-- Migration 005: workout_exercises
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.workout_exercises (
  id          UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id  UUID     NOT NULL REFERENCES public.workouts(id) ON DELETE CASCADE,
  exercise_id TEXT     NOT NULL,
  order_index INTEGER  NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_we_workout_id ON public.workout_exercises (workout_id);

ALTER TABLE public.workout_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_workout_exercises" ON public.workout_exercises
  USING (
    auth.uid() = (SELECT user_id FROM public.workouts WHERE id = workout_id)
  )
  WITH CHECK (
    auth.uid() = (SELECT user_id FROM public.workouts WHERE id = workout_id)
  );

-- Migration M6 (folded in): Remove FK constraint that required exercises to exist in the exercises table
ALTER TABLE public.workout_exercises
  DROP CONSTRAINT IF EXISTS workout_exercises_exercise_id_fkey;
