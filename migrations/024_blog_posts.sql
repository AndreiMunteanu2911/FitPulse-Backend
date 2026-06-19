-- =============================================================================
-- Migration: Blog Posts
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.blog_posts (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT        NOT NULL,
    content     TEXT        NOT NULL,
    image_url   TEXT,
    author_id   UUID        NOT NULL REFERENCES public.user_stats(user_id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

-- Everyone can read blog posts
CREATE POLICY "blog_posts_read_all" ON public.blog_posts
    FOR SELECT USING (true);

-- Only admins can insert/update/delete blog posts
CREATE POLICY "blog_posts_admin_all" ON public.blog_posts
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_stats
            WHERE user_stats.user_id = auth.uid()
            AND user_stats.role = 'admin'
        )
    );

CREATE OR REPLACE TRIGGER trg_blog_posts_updated_at
    BEFORE UPDATE ON public.blog_posts
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
