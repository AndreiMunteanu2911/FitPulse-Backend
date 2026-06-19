-- =============================================================================
-- Migration 011: template_exercises
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.template_exercises (
  id          UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID     NOT NULL REFERENCES public.workout_templates(id) ON DELETE CASCADE,
  exercise_id TEXT     NOT NULL,
  order_index INTEGER  NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_te_template_id ON public.template_exercises (template_id);

ALTER TABLE public.template_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_template_exercises" ON public.template_exercises
  USING (
    auth.uid() = (SELECT user_id FROM public.workout_templates WHERE id = template_id)
  )
  WITH CHECK (
    auth.uid() = (SELECT user_id FROM public.workout_templates WHERE id = template_id)
  );

-- Migration M6 (folded in): Remove FK constraint on exercise_id
ALTER TABLE public.template_exercises
  DROP CONSTRAINT IF EXISTS template_exercises_exercise_id_fkey;
