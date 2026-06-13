
-- 1) Replace org_memberships UPDATE policy to block role escalation to superadmin
DROP POLICY IF EXISTS "Org admins can update memberships" ON public.org_memberships;
CREATE POLICY "Org admins can update memberships"
ON public.org_memberships
FOR UPDATE
TO authenticated
USING (
  public.is_superadmin(auth.uid())
  OR public.user_has_org_role(auth.uid(), org_id, ARRAY['owner'::org_role, 'admin'::org_role])
)
WITH CHECK (
  (
    public.is_superadmin(auth.uid())
    OR public.user_has_org_role(auth.uid(), org_id, ARRAY['owner'::org_role, 'admin'::org_role])
  )
  AND (
    role <> 'superadmin'::org_role
    OR public.is_superadmin(auth.uid())
  )
);

-- Also harden INSERT: org admins should not be able to insert a superadmin row
DROP POLICY IF EXISTS "Org admins can insert org memberships" ON public.org_memberships;
CREATE POLICY "Org admins can insert org memberships"
ON public.org_memberships
FOR INSERT
TO authenticated
WITH CHECK (
  public.user_has_org_role(auth.uid(), org_id, ARRAY['owner'::org_role, 'admin'::org_role])
  AND role <> 'superadmin'::org_role
);

-- 2) campaign_metrics UPDATE policy for org members
CREATE POLICY "Org members can update campaign metrics"
ON public.campaign_metrics
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.campaigns c
    JOIN public.projects p ON p.id = c.project_id
    WHERE c.id = campaign_metrics.campaign_id
      AND public.user_has_org_access(auth.uid(), p.org_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.campaigns c
    JOIN public.projects p ON p.id = c.project_id
    WHERE c.id = campaign_metrics.campaign_id
      AND public.user_has_org_access(auth.uid(), p.org_id)
  )
);

-- 3) brand-voice-uploads bucket: DELETE + UPDATE policies for org members
CREATE POLICY "Authenticated users can delete brand voice docs"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'brand-voice-uploads'
  AND (storage.foldername(name))[1] IN (
    SELECT p.id::text FROM public.projects p
    JOIN public.org_memberships om ON om.org_id = p.org_id
    WHERE om.user_id = auth.uid()
  )
);

CREATE POLICY "Authenticated users can update brand voice docs"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'brand-voice-uploads'
  AND (storage.foldername(name))[1] IN (
    SELECT p.id::text FROM public.projects p
    JOIN public.org_memberships om ON om.org_id = p.org_id
    WHERE om.user_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'brand-voice-uploads'
  AND (storage.foldername(name))[1] IN (
    SELECT p.id::text FROM public.projects p
    JOIN public.org_memberships om ON om.org_id = p.org_id
    WHERE om.user_id = auth.uid()
  )
);
