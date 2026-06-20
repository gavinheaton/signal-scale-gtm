-- Delete policy for campaigns (manager+)
CREATE POLICY "Users can delete project campaigns"
ON public.campaigns FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM projects p
    JOIN org_memberships om ON om.org_id = p.org_id
    WHERE p.id = campaigns.project_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin', 'superadmin', 'manager')
  )
);

-- Delete policy for campaign_metrics
CREATE POLICY "Users can delete campaign metrics"
ON public.campaign_metrics FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM campaigns c
    JOIN projects p ON p.id = c.project_id
    WHERE c.id = campaign_metrics.campaign_id
      AND user_has_org_access(auth.uid(), p.org_id)
  )
);