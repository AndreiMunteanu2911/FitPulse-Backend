-- =============================================================================
-- Migration 010: workout_templates (with is_official for admin-curated templates)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.workout_templates (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT         NOT NULL,
  description TEXT,
  is_official BOOLEAN      NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_templates_user_id ON public.workout_templates (user_id);

ALTER TABLE public.workout_templates ENABLE ROW LEVEL SECURITY;

-- Users see their own templates + official templates
CREATE POLICY "own_workout_templates" ON public.workout_templates
  USING (auth.uid() = user_id OR is_official = true)
  WITH CHECK (auth.uid() = user_id);

-- Triggers for auto-updating updated_at
CREATE OR REPLACE TRIGGER trg_workout_templates_updated_at
  BEFORE UPDATE ON public.workout_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
