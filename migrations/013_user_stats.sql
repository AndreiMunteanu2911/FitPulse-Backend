-- =============================================================================
-- Migration 013: user_stats
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_stats (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_xp            INTEGER      NOT NULL DEFAULT 0,
  level               INTEGER      NOT NULL DEFAULT 1,
  streak_freeze_count INTEGER      NOT NULL DEFAULT 0,
  role                TEXT         NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'admin')),
  display_name        TEXT,
  birthday            DATE,
  gender              TEXT CHECK (gender IN ('male', 'female', 'other')),
  height_cm           NUMERIC(5,1),
  onboarding_done     BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_user_stats" ON public.user_stats
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "read_user_roles" ON public.user_stats
  FOR SELECT USING (true);

CREATE POLICY "admins_manage_roles" ON public.user_stats
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.user_stats ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
    )
  );

CREATE OR REPLACE TRIGGER trg_user_stats_updated_at
  BEFORE UPDATE ON public.user_stats
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_stats (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
