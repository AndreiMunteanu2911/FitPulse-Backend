-- Logic integrity and transactional feature operations.

ALTER TABLE public.form_logs
  ADD COLUMN IF NOT EXISTS rules_version TEXT NOT NULL DEFAULT 'form-rules-v1';

ALTER TABLE public.ai_messages
  ADD COLUMN IF NOT EXISTS client_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS ai_messages_conversation_client_id_key
  ON public.ai_messages (conversation_id, client_id);

-- Keep at most one resumable workout per user.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY user_id ORDER BY created_at DESC, id DESC
  ) AS row_number
  FROM public.workouts
  WHERE status = 'draft'
)
DELETE FROM public.workouts
WHERE id IN (SELECT id FROM ranked WHERE row_number > 1);

CREATE UNIQUE INDEX IF NOT EXISTS workouts_one_draft_per_user
  ON public.workouts (user_id)
  WHERE status = 'draft';

CREATE OR REPLACE FUNCTION public.replace_workout_draft(
  p_name TEXT,
  p_exercises JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_workout_id UUID;
  v_exercise JSONB;
  v_set JSONB;
  v_workout_exercise_id UUID;
  v_exercise_index INTEGER := 0;
  v_set_index INTEGER;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  DELETE FROM public.workouts
  WHERE user_id = v_user_id AND status = 'draft';

  INSERT INTO public.workouts (user_id, name, status)
  VALUES (v_user_id, LEFT(COALESCE(NULLIF(TRIM(p_name), ''), 'My Workout'), 100), 'draft')
  RETURNING id INTO v_workout_id;

  FOR v_exercise IN SELECT value FROM jsonb_array_elements(COALESCE(p_exercises, '[]'::jsonb))
  LOOP
    INSERT INTO public.workout_exercises (workout_id, exercise_id, order_index)
    VALUES (v_workout_id, v_exercise->>'exercise_id', v_exercise_index)
    RETURNING id INTO v_workout_exercise_id;

    v_set_index := 1;
    FOR v_set IN SELECT value FROM jsonb_array_elements(COALESCE(v_exercise->'sets', '[]'::jsonb))
    LOOP
      INSERT INTO public.sets (workout_exercise_id, set_number, reps, weight, is_confirmed)
      VALUES (
        v_workout_exercise_id,
        v_set_index,
        GREATEST(0, COALESCE((v_set->>'reps')::INTEGER, 0)),
        GREATEST(0, COALESCE((v_set->>'weight')::NUMERIC, 0)),
        COALESCE((v_set->>'is_confirmed')::BOOLEAN, FALSE)
      );
      v_set_index := v_set_index + 1;
    END LOOP;
    v_exercise_index := v_exercise_index + 1;
  END LOOP;

  RETURN v_workout_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_workout_template(
  p_id UUID,
  p_name TEXT,
  p_description TEXT,
  p_exercise_ids TEXT[]
) RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_template_id UUID;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.workout_templates (user_id, name, description)
    VALUES (v_user_id, LEFT(TRIM(p_name), 100), NULLIF(TRIM(p_description), ''))
    RETURNING id INTO v_template_id;
  ELSE
    UPDATE public.workout_templates
    SET name = LEFT(TRIM(p_name), 100),
        description = NULLIF(TRIM(p_description), ''),
        updated_at = NOW()
    WHERE id = p_id AND user_id = v_user_id
    RETURNING id INTO v_template_id;
    IF v_template_id IS NULL THEN RAISE EXCEPTION 'Template not found'; END IF;
    DELETE FROM public.template_exercises WHERE template_id = v_template_id;
  END IF;

  INSERT INTO public.template_exercises (template_id, exercise_id, order_index)
  SELECT v_template_id, exercise_id, ordinality - 1
  FROM unnest(COALESCE(p_exercise_ids, ARRAY[]::TEXT[])) WITH ORDINALITY AS item(exercise_id, ordinality);

  RETURN v_template_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_workout_state(
  p_workout_id UUID,
  p_name TEXT,
  p_sets JSONB
) RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_set JSONB;
BEGIN
  UPDATE public.workouts
  SET name = LEFT(COALESCE(NULLIF(TRIM(p_name), ''), name), 100)
  WHERE id = p_workout_id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Workout not found'; END IF;

  FOR v_set IN SELECT value FROM jsonb_array_elements(COALESCE(p_sets, '[]'::jsonb))
  LOOP
    UPDATE public.sets s SET
      reps = GREATEST(0, LEAST(1000, (v_set->>'reps')::INTEGER)),
      weight = GREATEST(0, LEAST(100000, (v_set->>'weight')::NUMERIC)),
      is_confirmed = COALESCE((v_set->>'is_confirmed')::BOOLEAN, s.is_confirmed)
    FROM public.workout_exercises we, public.workouts w
    WHERE s.id = (v_set->>'id')::UUID
      AND s.workout_exercise_id = we.id
      AND we.workout_id = w.id
      AND w.id = p_workout_id
      AND w.user_id = auth.uid();
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_workout(p_workout_id UUID) RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.workouts
    WHERE id = p_workout_id AND user_id = auth.uid() AND status = 'draft'
  ) THEN RAISE EXCEPTION 'Workout not found or already finished'; END IF;

  DELETE FROM public.sets s
  USING public.workout_exercises we
  WHERE s.workout_exercise_id = we.id
    AND we.workout_id = p_workout_id
    AND s.reps = 0 AND s.weight = 0;

  UPDATE public.sets s SET is_confirmed = TRUE
  FROM public.workout_exercises we
  WHERE s.workout_exercise_id = we.id AND we.workout_id = p_workout_id;

  UPDATE public.workouts
  SET status = 'completed', finished_at = NOW()
  WHERE id = p_workout_id AND user_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_achievement(
  p_achievement_id TEXT,
  p_xp_reward INTEGER
) RETURNS TABLE(total_xp INTEGER, level INTEGER, claimed_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  INSERT INTO public.user_achievements (user_id, achievement_id)
  VALUES (v_user_id, p_achievement_id)
  RETURNING unlocked_at INTO claimed_at;

  INSERT INTO public.user_stats (user_id, total_xp, level)
  VALUES (v_user_id, p_xp_reward, FLOOR(SQRT(p_xp_reward / 50.0)) + 1)
  ON CONFLICT (user_id) DO UPDATE
  SET total_xp = public.user_stats.total_xp + EXCLUDED.total_xp,
      level = FLOOR(SQRT((public.user_stats.total_xp + EXCLUDED.total_xp) / 50.0)) + 1
  RETURNING public.user_stats.total_xp, public.user_stats.level
  INTO total_xp, level;

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.fulfill_product_order(
  p_order_id UUID,
  p_session_id TEXT,
  p_quantity INTEGER,
  p_shipping_address JSONB
) RETURNS TABLE(status TEXT, product_id UUID, amount_usd NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_product public.products%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'order_not_found', NULL::UUID, NULL::NUMERIC; RETURN; END IF;
  IF v_order.status = 'completed' AND v_order.stripe_session_id = p_session_id THEN
    RETURN QUERY SELECT 'already_processed', v_order.product_id, v_order.amount_usd; RETURN;
  END IF;

  SELECT * INTO v_product FROM public.products WHERE id = v_order.product_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'product_not_found', NULL::UUID, NULL::NUMERIC; RETURN; END IF;
  IF v_product.is_physical AND v_product.stock_quantity < GREATEST(1, p_quantity) THEN
    RAISE EXCEPTION 'Insufficient stock';
  END IF;

  IF v_product.is_physical THEN
    UPDATE public.products
    SET stock_quantity = stock_quantity - GREATEST(1, p_quantity)
    WHERE id = v_product.id;
  END IF;

  UPDATE public.orders SET
    status = 'completed',
    amount_usd = v_product.price_usd * GREATEST(1, p_quantity),
    shipping_address = p_shipping_address,
    payment_method = 'stripe',
    stripe_session_id = p_session_id
  WHERE id = p_order_id;

  RETURN QUERY SELECT 'processed', v_product.id, v_product.price_usd * GREATEST(1, p_quantity);
END;
$$;

REVOKE ALL ON FUNCTION public.fulfill_product_order(UUID, TEXT, INTEGER, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fulfill_product_order(UUID, TEXT, INTEGER, JSONB) TO service_role;
