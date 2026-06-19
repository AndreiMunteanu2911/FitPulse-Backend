-- =============================================================================
-- Migration 015: user_achievements (unlock log)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_achievements (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id TEXT         NOT NULL REFERENCES public.achievements(id),
  unlocked_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_ua_user_id ON public.user_achievements (user_id);

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_user_achievements" ON public.user_achievements
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
