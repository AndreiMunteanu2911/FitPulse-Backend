-- =============================================================================
-- Migration: Storage Policies for blog-images bucket
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('blog-images', 'blog-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "blog_images_upload_admin" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'blog-images'
    AND EXISTS (
        SELECT 1 FROM public.user_stats
        WHERE user_stats.user_id = auth.uid()
        AND user_stats.role = 'admin'
    )
  );

CREATE POLICY "blog_images_read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'blog-images'
  );

CREATE POLICY "blog_images_delete_admin" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'blog-images'
    AND EXISTS (
        SELECT 1 FROM public.user_stats
        WHERE user_stats.user_id = auth.uid()
        AND user_stats.role = 'admin'
    )
  );
