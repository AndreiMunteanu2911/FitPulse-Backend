-- =============================================================================
-- Migration: Storage Policies for post-images bucket
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('post-images', 'post-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "post_images_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'post-images'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "post_images_read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'post-images'
  );

CREATE POLICY "post_images_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'post-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
