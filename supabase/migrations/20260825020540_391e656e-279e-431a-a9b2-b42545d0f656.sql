CREATE TABLE public.discovery_search_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.discovery_campaigns(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'running',
  candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  debug jsonb,
  error text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_discovery_search_runs_campaign ON public.discovery_search_runs(campaign_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.discovery_search_runs TO authenticated;
GRANT ALL ON public.discovery_search_runs TO service_role;

ALTER TABLE public.discovery_search_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members manage discovery search runs"
ON public.discovery_search_runs
FOR ALL
TO authenticated
USING (
  campaign_id IN (
    SELECT dc.id FROM public.discovery_campaigns dc
    JOIN public.projects p ON p.id = dc.project_id
    JOIN public.org_memberships om ON om.org_id = p.org_id
    WHERE om.user_id = auth.uid()
  )
)
WITH CHECK (
  campaign_id IN (
    SELECT dc.id FROM public.discovery_campaigns dc
    JOIN public.projects p ON p.id = dc.project_id
    JOIN public.org_memberships om ON om.org_id = p.org_id
    WHERE om.user_id = auth.uid()
  )
);

CREATE TRIGGER discovery_search_runs_updated_at
BEFORE UPDATE ON public.discovery_search_runs
FOR EACH ROW EXECUTE FUNCTION public.discovery_set_updated_at();