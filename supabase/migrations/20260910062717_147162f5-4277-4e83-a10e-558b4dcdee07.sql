CREATE TABLE public.competitor_market_positions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  competitor_id uuid REFERENCES public.competitors(id) ON DELETE CASCADE,
  persona_id uuid REFERENCES public.personas(id) ON DELETE CASCADE,
  leadership smallint NOT NULL DEFAULT 50,
  differentiation smallint NOT NULL DEFAULT 50,
  rationale text,
  cited_dimension_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX competitor_market_positions_unique
  ON public.competitor_market_positions (project_id, COALESCE(competitor_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(persona_id, '00000000-0000-0000-0000-000000000000'::uuid));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitor_market_positions TO authenticated;
GRANT ALL ON public.competitor_market_positions TO service_role;

ALTER TABLE public.competitor_market_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members manage market positions"
ON public.competitor_market_positions FOR ALL TO authenticated
USING (project_id IN (
  SELECT p.id FROM public.projects p
  JOIN public.org_memberships om ON om.org_id = p.org_id
  WHERE om.user_id = auth.uid()
))
WITH CHECK (project_id IN (
  SELECT p.id FROM public.projects p
  JOIN public.org_memberships om ON om.org_id = p.org_id
  WHERE om.user_id = auth.uid()
));

CREATE TRIGGER competitor_market_positions_set_updated_at
BEFORE UPDATE ON public.competitor_market_positions
FOR EACH ROW EXECUTE FUNCTION public.discovery_set_updated_at();