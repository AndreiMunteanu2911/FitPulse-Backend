-- =============================================================================
-- Migration 029: Rich form analysis session logs
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.form_logs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_id          TEXT NOT NULL REFERENCES public.exercises(exercise_id) ON DELETE CASCADE,
  score                INTEGER NOT NULL,
  realtime_score       INTEGER NOT NULL DEFAULT 0,
  postset_score        INTEGER NOT NULL DEFAULT 0,
  reps                 INTEGER NOT NULL DEFAULT 0,
  duration_ms          INTEGER NOT NULL DEFAULT 0,
  detector_version     TEXT NOT NULL DEFAULT 'unknown',
  rules_confidence     DOUBLE PRECISION NOT NULL DEFAULT 0,
  analysis_status      TEXT NOT NULL DEFAULT 'local_only',
  feedback_summary     TEXT NOT NULL DEFAULT '',
  feedback_json        JSONB NOT NULL DEFAULT '{}'::jsonb,
  rep_metrics_json     JSONB NOT NULL DEFAULT '[]'::jsonb,
  landmark_stream_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  worst_segment_json   JSONB,
  used_cloud_coach     BOOLEAN NOT NULL DEFAULT FALSE,
  cloud_model          TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT form_logs_score_range CHECK (score BETWEEN 0 AND 100),
  CONSTRAINT form_logs_realtime_score_range CHECK (realtime_score BETWEEN 0 AND 100),
  CONSTRAINT form_logs_postset_score_range CHECK (postset_score BETWEEN 0 AND 100),
  CONSTRAINT form_logs_rules_confidence_range CHECK (rules_confidence BETWEEN 0 AND 1),
  CONSTRAINT form_logs_analysis_status_check CHECK (
    analysis_status IN ('local_only', 'cloud_pending', 'cloud_complete', 'cloud_failed')
  )
);

CREATE INDEX IF NOT EXISTS idx_form_logs_user_exercise ON public.form_logs(user_id, exercise_id);
CREATE INDEX IF NOT EXISTS idx_form_logs_created_at ON public.form_logs(created_at DESC);

ALTER TABLE public.form_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "form_logs_user_read" ON public.form_logs
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "form_logs_user_insert" ON public.form_logs
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "form_logs_user_delete" ON public.form_logs
  FOR DELETE USING (user_id = auth.uid());
