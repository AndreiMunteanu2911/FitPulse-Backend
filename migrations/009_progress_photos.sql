-- =============================================================================
-- Migration 009: progress_photos
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.progress_photos (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  photo_url  TEXT         NOT NULL,
  log_date   DATE         NOT NULL DEFAULT CURRENT_DATE,
  notes      TEXT,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_photos_user_date ON public.progress_photos (user_id, log_date DESC);

ALTER TABLE public.progress_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_progress_photos" ON public.progress_photos
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
