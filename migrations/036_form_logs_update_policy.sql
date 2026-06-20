-- Allow authenticated users to attach cloud coaching results to their own form logs.

DROP POLICY IF EXISTS "form_logs_user_update" ON public.form_logs;

CREATE POLICY "form_logs_user_update" ON public.form_logs
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
