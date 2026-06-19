-- =============================================================================
-- Migration 006: sets
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.sets (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_exercise_id UUID          NOT NULL REFERENCES public.workout_exercises(id) ON DELETE CASCADE,
  set_number          INTEGER       NOT NULL DEFAULT 1,
  reps                INTEGER       NOT NULL DEFAULT 0,
  weight              NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_confirmed        BOOLEAN       NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_sets_we_id ON public.sets (workout_exercise_id);

ALTER TABLE public.sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_sets" ON public.sets
  USING (
    auth.uid() = (
      SELECT w.user_id
      FROM   public.workouts w
      JOIN   public.workout_exercises we ON we.workout_id = w.id
      WHERE  we.id = workout_exercise_id
    )
  )
  WITH CHECK (
    auth.uid() = (
      SELECT w.user_id
      FROM   public.workouts w
      JOIN   public.workout_exercises we ON we.workout_id = w.id
      WHERE  we.id = workout_exercise_id
    )
  );
