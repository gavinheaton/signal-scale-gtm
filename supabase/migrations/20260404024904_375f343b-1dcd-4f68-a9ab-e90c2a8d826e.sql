
-- Create the brand-voice-uploads storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('brand-voice-uploads', 'brand-voice-uploads', false);

-- RLS: Authenticated users can upload files to their project's folder
CREATE POLICY "Authenticated users can upload brand voice docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'brand-voice-uploads'
  AND (storage.foldername(name))[1] IN (
    SELECT p.id::text FROM projects p
    JOIN org_memberships om ON om.org_id = p.org_id
    WHERE om.user_id = auth.uid()
  )
);

-- RLS: Authenticated users can read files from their project's folder
CREATE POLICY "Authenticated users can read brand voice docs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'brand-voice-uploads'
  AND (storage.foldername(name))[1] IN (
    SELECT p.id::text FROM projects p
    JOIN org_memberships om ON om.org_id = p.org_id
    WHERE om.user_id = auth.uid()
  )
);
