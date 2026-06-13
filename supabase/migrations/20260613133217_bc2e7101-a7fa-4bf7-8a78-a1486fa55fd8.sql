
-- 1. Asset images storage: replace permissive policies with org-scoped
DROP POLICY IF EXISTS "Authenticated users can upload asset images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update asset images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete asset images" ON storage.objects;
DROP POLICY IF EXISTS "Asset images are publicly viewable" ON storage.objects;

-- Public read via public URL works without SELECT policy on storage.objects for public buckets,
-- but keep a narrow SELECT policy so org members can list their own project's files.
CREATE POLICY "Org members can list project asset images"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'asset-images'
  AND (storage.foldername(name))[1] IN (
    SELECT p.id::text FROM public.projects p
    JOIN public.org_memberships om ON om.org_id = p.org_id
    WHERE om.user_id = auth.uid()
  )
);

CREATE POLICY "Org members can upload project asset images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'asset-images'
  AND (storage.foldername(name))[1] IN (
    SELECT p.id::text FROM public.projects p
    JOIN public.org_memberships om ON om.org_id = p.org_id
    WHERE om.user_id = auth.uid()
  )
);

CREATE POLICY "Org members can update project asset images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'asset-images'
  AND (storage.foldername(name))[1] IN (
    SELECT p.id::text FROM public.projects p
    JOIN public.org_memberships om ON om.org_id = p.org_id
    WHERE om.user_id = auth.uid()
  )
);

CREATE POLICY "Org members can delete project asset images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'asset-images'
  AND (storage.foldername(name))[1] IN (
    SELECT p.id::text FROM public.projects p
    JOIN public.org_memberships om ON om.org_id = p.org_id
    WHERE om.user_id = auth.uid()
  )
);

-- 2. DELETE policies for content tables (org members can delete)
CREATE POLICY "Users can delete project brand voices"
ON public.brand_voices FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.projects p
  WHERE p.id = brand_voices.project_id
    AND public.user_has_org_access(auth.uid(), p.org_id)
));

CREATE POLICY "Users can delete project icps"
ON public.icps FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.projects p
  WHERE p.id = icps.project_id
    AND public.user_has_org_access(auth.uid(), p.org_id)
));

CREATE POLICY "Users can delete project personas"
ON public.personas FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.projects p
  WHERE p.id = personas.project_id
    AND public.user_has_org_access(auth.uid(), p.org_id)
));

CREATE POLICY "Users can delete project wizard sessions"
ON public.wizard_sessions FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.projects p
  WHERE p.id = wizard_sessions.project_id
    AND public.user_has_org_access(auth.uid(), p.org_id)
));

-- 3. Projects DELETE — restrict to owner/admin/superadmin (mirrors delete_project_cascade)
CREATE POLICY "Owners and admins can delete projects"
ON public.projects FOR DELETE TO authenticated
USING (
  public.is_superadmin(auth.uid())
  OR public.user_has_org_role(auth.uid(), org_id, ARRAY['owner'::org_role, 'admin'::org_role])
);

-- 4. Org memberships UPDATE + DELETE — restrict to owners/admins/superadmins
CREATE POLICY "Org admins can update memberships"
ON public.org_memberships FOR UPDATE TO authenticated
USING (
  public.is_superadmin(auth.uid())
  OR public.user_has_org_role(auth.uid(), org_id, ARRAY['owner'::org_role, 'admin'::org_role])
)
WITH CHECK (
  public.is_superadmin(auth.uid())
  OR public.user_has_org_role(auth.uid(), org_id, ARRAY['owner'::org_role, 'admin'::org_role])
);

CREATE POLICY "Org admins can delete memberships"
ON public.org_memberships FOR DELETE TO authenticated
USING (
  public.is_superadmin(auth.uid())
  OR public.user_has_org_role(auth.uid(), org_id, ARRAY['owner'::org_role, 'admin'::org_role])
);
