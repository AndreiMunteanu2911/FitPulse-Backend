-- =============================================================================
-- Migration 012: user_exercises (per-user exercise favourites)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_exercises (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_id TEXT         NOT NULL,
  is_favorite BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, exercise_id)
);

CREATE INDEX IF NOT EXISTS idx_user_exercises_user_id ON public.user_exercises (user_id);

ALTER TABLE public.user_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_user_exercises" ON public.user_exercises
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Migration M6 (folded in): Remove FK constraint on exercise_id
ALTER TABLE public.user_exercises
  DROP CONSTRAINT IF EXISTS user_exercises_exercise_id_fkey;
