-- =============================================================================
-- Migration 004: workouts
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.workouts (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT         NOT NULL DEFAULT 'My Workout',
  workout_date DATE         NOT NULL DEFAULT CURRENT_DATE,
  status       TEXT         NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft', 'completed')),
  finished_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workouts_user_status ON public.workouts (user_id, status);
CREATE INDEX IF NOT EXISTS idx_workouts_user_date   ON public.workouts (user_id, workout_date DESC);

ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_workouts" ON public.workouts
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
