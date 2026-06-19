-- =============================================================================
-- Migration 002: exercises (shared exercise catalogue)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.exercises (
  exercise_id      TEXT  PRIMARY KEY,
  name             TEXT  NOT NULL,
  gif_url          TEXT,
  target_muscles   TEXT[],
  body_parts       TEXT[],
  equipments       TEXT[],
  secondary_muscles TEXT[],
  instructions     TEXT[]
);

ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises
    ADD COLUMN IF NOT EXISTS form_rules JSONB;


-- Standard exercises are publicly readable (custom exercises don't live here)
CREATE POLICY "exercises_public_read" ON public.exercises
  FOR SELECT USING (exercise_id NOT LIKE 'custom_%');

-- Admins can manage exercises (requires role = 'admin' in user_stats)
CREATE POLICY "admins_manage_exercises" ON public.exercises
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_stats
      WHERE user_stats.user_id = auth.uid()
        AND user_stats.role = 'admin'
    )
  );

-- Legacy: clean up any custom_% rows that were mirrored to satisfy old FK constraints
DELETE FROM public.exercises WHERE exercise_id LIKE 'custom_%';

CREATE OR REPLACE FUNCTION public.admin_mark_needs_review_form_rules_ai_generated()
RETURNS TABLE(exercise_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_stats
    WHERE user_stats.user_id = auth.uid()
      AND user_stats.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden';
END IF;

RETURN QUERY
UPDATE public.exercises
SET form_rules = jsonb_set(
        form_rules,
        '{review,status}',
        to_jsonb('ai_generated'::text),
        false
                 )
WHERE exercise_id NOT LIKE 'custom_%'
  AND form_rules IS NOT NULL
  AND form_rules->'review'->>'status' = 'needs_review'
    RETURNING exercise_id;
END;
$$;