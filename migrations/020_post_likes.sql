-- =============================================================================
-- Migration: Post Likes
-- =============================================================================

-- Post Likes
CREATE TABLE IF NOT EXISTS public.post_likes (
                                                 id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id    UUID        NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (post_id, user_id),
    CONSTRAINT post_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_stats(user_id)
    );

ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_likes_visible_to_friends" ON public.post_likes
  FOR SELECT USING (
                 EXISTS (
                 SELECT 1 FROM public.posts p
                 WHERE p.id = post_likes.post_id
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

CREATE POLICY "post_likes_insert_own" ON public.post_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "post_likes_delete_own" ON public.post_likes
  FOR DELETE USING (auth.uid() = user_id);