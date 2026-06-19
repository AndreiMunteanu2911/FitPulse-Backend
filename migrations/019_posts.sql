-- =============================================================================
-- Migration: Posts
-- =============================================================================

-- Posts
CREATE TABLE IF NOT EXISTS public.posts (
                                            id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content         TEXT,
    image_url       TEXT,
    workout_summary TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_stats(user_id)
    );

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- Users can see their own posts and posts from accepted friends
CREATE POLICY "posts_visible_to_friends" ON public.posts
  FOR SELECT USING (
                 auth.uid() = user_id
                 OR EXISTS (
                 SELECT 1 FROM public.friendships f
                 WHERE f.status = 'accepted'
                 AND (
                 (f.user_id = auth.uid() AND f.friend_id = posts.user_id)
                 OR (f.friend_id = auth.uid() AND f.user_id = posts.user_id)
                 )
                 )
                 );

CREATE POLICY "posts_insert_own" ON public.posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "posts_update_own" ON public.posts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "posts_delete_own" ON public.posts
  FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE TRIGGER trg_posts_updated_at
  BEFORE UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();