-- =============================================================================
-- Migration 001: Extensions & Shared Functions
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Auto-update updated_at trigger function (used by user_stats, workout_templates)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;
