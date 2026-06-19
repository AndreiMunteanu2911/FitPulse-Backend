-- =============================================================================
-- Migration: Blog Likes
-- =============================================================================

-- Blog Likes
CREATE TABLE IF NOT EXISTS public.blog_likes (
                                                 id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    blog_post_id  UUID        NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
    user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (blog_post_id, user_id),
    CONSTRAINT blog_likes_user_stats_fkey FOREIGN KEY (user_id) REFERENCES public.user_stats(user_id)
    );

ALTER TABLE public.blog_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blog_likes_select_authenticated" ON public.blog_likes
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "blog_likes_insert_authenticated" ON public.blog_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "blog_likes_delete_authenticated" ON public.blog_likes
  FOR DELETE USING (auth.uid() = user_id);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_blog_likes_blog_post_id ON public.blog_likes(blog_post_id);
CREATE INDEX IF NOT EXISTS idx_blog_likes_user_id ON public.blog_likes(user_id);