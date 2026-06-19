-- =============================================================================
-- Migration 007: personal_records
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.personal_records (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_id  TEXT          NOT NULL,
  max_weight   NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_reps     INTEGER       NOT NULL DEFAULT 0,
  workout_date DATE          NOT NULL,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, exercise_id)
);

CREATE INDEX IF NOT EXISTS idx_pr_user_id ON public.personal_records (user_id);

ALTER TABLE public.personal_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_personal_records" ON public.personal_records
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Migration M6 (folded in): Remove FK constraint on exercise_id
ALTER TABLE public.personal_records
  DROP CONSTRAINT IF EXISTS personal_records_exercise_id_fkey;
