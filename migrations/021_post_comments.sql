-- =============================================================================
-- Migration: Post Comments
-- =============================================================================

-- Post Comments
CREATE TABLE IF NOT EXISTS public.post_comments (
                                                    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id    UUID        NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content    TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT post_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_stats(user_id)
    );

ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_comments_visible_to_friends" ON public.post_comments
  FOR SELECT USING (
                 EXISTS (
                 SELECT 1 FROM public.posts p
                 WHERE p.id = post_comments.post_id
                 AND (
                 p.user_id = auth.uid()
                 OR EXISTS (
                 SELECT 1 FROM public.friendships f
                 WHERE f.status = 'accepted'
                 AND (
                 (f.user_id = auth.uid() AND f.friend_id = p.user_id)
                 OR (f.friend_id = auth.uid() AND f.user_id = p.user_id)
                 )
                 )
                 )
                 )
                 );

CREATE POLICY "post_comments_insert_own" ON public.post_comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "post_comments_update_own" ON public.post_comments
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "post_comments_delete_own" ON public.post_comments
  FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE TRIGGER trg_post_comments_updated_at
  BEFORE UPDATE ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();