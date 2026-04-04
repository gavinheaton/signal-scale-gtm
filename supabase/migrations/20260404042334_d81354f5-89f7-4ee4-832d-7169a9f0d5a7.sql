
ALTER TABLE public.campaign_assets ADD COLUMN content text;
ALTER TABLE public.campaign_assets ADD COLUMN notion_url text;
ALTER TABLE public.campaigns ADD COLUMN notion_url text;

CREATE POLICY "Users can update campaign assets"
ON public.campaign_assets
FOR UPDATE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM campaigns c
  JOIN projects p ON p.id = c.project_id
  WHERE c.id = campaign_assets.campaign_id
  AND user_has_org_access(auth.uid(), p.org_id)
));

CREATE POLICY "Users can delete campaign assets"
ON public.campaign_assets
FOR DELETE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM campaigns c
  JOIN projects p ON p.id = c.project_id
  WHERE c.id = campaign_assets.campaign_id
  AND user_has_org_access(auth.uid(), p.org_id)
));
