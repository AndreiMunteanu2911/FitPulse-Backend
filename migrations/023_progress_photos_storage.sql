-- =============================================================================
-- Migration: Storage Policies for progress-photos bucket
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('progress-photos', 'progress-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "progress_photos_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'progress-photos'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "progress_photos_read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'progress-photos'
  );

CREATE POLICY "progress_photos_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'progress-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "progress_photos_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'progress-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
