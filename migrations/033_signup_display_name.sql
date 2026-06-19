-- Preserve the display name supplied during signup, including when email
-- confirmation is required and no authenticated session exists yet.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_stats (user_id, display_name)
  VALUES (
    NEW.id,
    NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'display_name'), '')
  )
  ON CONFLICT (user_id) DO UPDATE
  SET display_name = COALESCE(
    public.user_stats.display_name,
    EXCLUDED.display_name
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
