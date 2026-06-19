-- =============================================================================
-- Migration 032: checkout and social post fixups
-- =============================================================================

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS workout_id UUID REFERENCES public.workouts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_posts_workout_id ON public.posts (workout_id);

CREATE POLICY "orders_insert_own" ON public.orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);
