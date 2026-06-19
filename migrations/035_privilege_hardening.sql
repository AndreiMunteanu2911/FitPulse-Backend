-- Harden profile, role, XP, and achievement privileges after moving all data
-- access behind the backend.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_stats
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

DROP POLICY IF EXISTS "own_user_stats" ON public.user_stats;
DROP POLICY IF EXISTS "read_user_roles" ON public.user_stats;
DROP POLICY IF EXISTS "admins_manage_roles" ON public.user_stats;

CREATE POLICY "user_stats_select_own" ON public.user_stats
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "user_stats_insert_own" ON public.user_stats
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_stats_update_own" ON public.user_stats
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "admins_select_user_stats" ON public.user_stats
  FOR SELECT TO authenticated
  USING (public.is_admin());

REVOKE INSERT, UPDATE, DELETE ON public.user_stats FROM anon, authenticated;
GRANT SELECT ON public.user_stats TO authenticated;
GRANT INSERT (user_id, display_name, birthday, gender, height_cm, onboarding_done)
  ON public.user_stats TO authenticated;
GRANT UPDATE (display_name, birthday, gender, height_cm, onboarding_done)
  ON public.user_stats TO authenticated;

CREATE OR REPLACE VIEW public.public_user_profiles
WITH (security_barrier = true)
AS
SELECT user_id, display_name
FROM public.user_stats;

REVOKE ALL ON public.public_user_profiles FROM PUBLIC, anon;
GRANT SELECT ON public.public_user_profiles TO authenticated;

DROP POLICY IF EXISTS "own_user_achievements" ON public.user_achievements;
CREATE POLICY "user_achievements_select_own" ON public.user_achievements
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE ON public.user_achievements FROM anon, authenticated;
GRANT SELECT ON public.user_achievements TO authenticated;

DROP FUNCTION IF EXISTS public.claim_achievement(TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.claim_achievement_for_user(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.claim_achievement_for_user(
  p_user_id UUID,
  p_achievement_id TEXT
) RETURNS TABLE(total_xp INTEGER, level INTEGER, claimed_at TIMESTAMPTZ, xp_earned INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_xp_reward INTEGER;
BEGIN
  SELECT xp_reward
  INTO v_xp_reward
  FROM public.achievements
  WHERE id = p_achievement_id;

  IF v_xp_reward IS NULL THEN
    RAISE EXCEPTION 'Unknown achievement';
  END IF;
  xp_earned := v_xp_reward;

  INSERT INTO public.user_achievements (user_id, achievement_id)
  VALUES (p_user_id, p_achievement_id)
  RETURNING unlocked_at INTO claimed_at;

  INSERT INTO public.user_stats (user_id, total_xp, level)
  VALUES (p_user_id, v_xp_reward, FLOOR(SQRT(v_xp_reward / 50.0)) + 1)
  ON CONFLICT (user_id) DO UPDATE
  SET total_xp = public.user_stats.total_xp + EXCLUDED.total_xp,
      level = FLOOR(SQRT((public.user_stats.total_xp + EXCLUDED.total_xp) / 50.0)) + 1
  RETURNING public.user_stats.total_xp, public.user_stats.level
  INTO total_xp, level;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_achievement_for_user(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_achievement_for_user(UUID, TEXT) TO service_role;

ALTER FUNCTION public.handle_new_user() SET search_path = pg_catalog;
ALTER FUNCTION public.admin_mark_needs_review_form_rules_ai_generated() SET search_path = pg_catalog;
ALTER FUNCTION public.fulfill_product_order(UUID, TEXT, INTEGER, JSONB) SET search_path = pg_catalog;
