-- =============================================================================
-- Migration: Storage Policies for product-images bucket
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "product_images_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'product-images'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "product_images_read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'product-images'
  );

CREATE POLICY "product_images_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'product-images'
    AND EXISTS (
      SELECT 1 FROM public.user_stats
      WHERE user_stats.user_id = auth.uid()
        AND user_stats.role = 'admin'
    )
  );

CREATE POLICY "product_images_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'product-images'
    AND EXISTS (
      SELECT 1 FROM public.user_stats
      WHERE user_stats.user_id = auth.uid()
        AND user_stats.role = 'admin'
    )
  );
