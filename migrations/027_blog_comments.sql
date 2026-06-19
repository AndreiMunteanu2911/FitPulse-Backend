-- =============================================================================
-- Migration: Blog Comments
-- =============================================================================

-- Blog Comments
CREATE TABLE IF NOT EXISTS public.blog_comments (
                                                    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    blog_post_id  UUID        NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
    user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content       TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT blog_comments_user_stats_fkey FOREIGN KEY (user_id) REFERENCES public.user_stats(user_id)
    );

ALTER TABLE public.blog_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blog_comments_select_authenticated" ON public.blog_comments
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "blog_comments_insert_authenticated" ON public.blog_comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "blog_comments_update_own" ON public.blog_comments
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "blog_comments_delete_own" ON public.blog_comments
  FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE TRIGGER trg_blog_comments_updated_at
  BEFORE UPDATE ON public.blog_comments
                                        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_blog_comments_blog_post_id ON public.blog_comments(blog_post_id);
CREATE INDEX IF NOT EXISTS idx_blog_comments_user_id ON public.blog_comments(user_id);