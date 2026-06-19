-- =============================================================================
-- Migration 003: custom_exercises (user-owned exercises)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.custom_exercises (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT         NOT NULL,
  body_part   TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_exercises_user_id   ON public.custom_exercises (user_id);
CREATE INDEX IF NOT EXISTS idx_custom_exercises_user_name ON public.custom_exercises (user_id, name);

ALTER TABLE public.custom_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_custom_exercises" ON public.custom_exercises
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Migration M4 (folded in): Add body_part column if it doesn't exist
ALTER TABLE public.custom_exercises ADD COLUMN IF NOT EXISTS body_part TEXT;
