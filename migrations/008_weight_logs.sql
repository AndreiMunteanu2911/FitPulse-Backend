-- =============================================================================
-- Migration 008: weight_logs
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.weight_logs (
  id       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  log_date DATE         NOT NULL,
  weight   NUMERIC(6,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_weight_logs_user_date ON public.weight_logs (user_id, log_date ASC);

ALTER TABLE public.weight_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_weight_logs" ON public.weight_logs
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
