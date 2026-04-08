-- ---------------------------------------------------------------------------
-- Storage buckets and RLS policies for Growth OS media uploads
-- Run this in your Supabase SQL editor (or via supabase db push).
-- ---------------------------------------------------------------------------

-- Create storage buckets (private by default)
INSERT INTO storage.buckets (id, name, public)
  VALUES ('brand-assets', 'brand-assets', false)
  ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
  VALUES ('generated-assets', 'generated-assets', false)
  ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
  VALUES ('competitor-assets', 'competitor-assets', false)
  ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS policies
-- Objects are stored at paths: {brand_id}/{sub_category}/{filename}
-- The first folder component is extracted and checked against brand access.
-- ---------------------------------------------------------------------------

-- Allow brand owners and members to upload objects
CREATE POLICY "brand_upload" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id IN ('brand-assets', 'generated-assets', 'competitor-assets')
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT brand_id FROM brand_members WHERE user_id = auth.uid()
      UNION
      SELECT id FROM brands WHERE owner_id = auth.uid()
    )
  );

-- Allow brand owners and members to read objects
CREATE POLICY "brand_read" ON storage.objects
  FOR SELECT
  USING (
    bucket_id IN ('brand-assets', 'generated-assets', 'competitor-assets')
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT brand_id FROM brand_members WHERE user_id = auth.uid()
      UNION
      SELECT id FROM brands WHERE owner_id = auth.uid()
    )
  );

-- Allow brand owners and members to delete their own objects
CREATE POLICY "brand_delete" ON storage.objects
  FOR DELETE
  USING (
    bucket_id IN ('brand-assets', 'generated-assets', 'competitor-assets')
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT brand_id FROM brand_members WHERE user_id = auth.uid()
      UNION
      SELECT id FROM brands WHERE owner_id = auth.uid()
    )
  );
