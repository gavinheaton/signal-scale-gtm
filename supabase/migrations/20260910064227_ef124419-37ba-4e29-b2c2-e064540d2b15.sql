CREATE TABLE public.ecosystem_stakeholder_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  map_id uuid NOT NULL REFERENCES public.ecosystem_maps(id) ON DELETE CASCADE,
  name text NOT NULL,
  subtitle text,
  node_kind text NOT NULL DEFAULT 'stakeholder',
  roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  relationships jsonb NOT NULL DEFAULT '[]'::jsonb,
  rationale text,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  node_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ecosystem_stakeholder_suggestions TO authenticated;
GRANT ALL ON public.ecosystem_stakeholder_suggestions TO service_role;
ALTER TABLE public.ecosystem_stakeholder_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members manage stakeholder suggestions" ON public.ecosystem_stakeholder_suggestions
FOR ALL TO authenticated
USING (project_id IN (SELECT p.id FROM public.projects p JOIN public.org_memberships om ON om.org_id = p.org_id WHERE om.user_id = auth.uid()))
WITH CHECK (project_id IN (SELECT p.id FROM public.projects p JOIN public.org_memberships om ON om.org_id = p.org_id WHERE om.user_id = auth.uid()));
CREATE TRIGGER ecosystem_stakeholder_suggestions_set_updated_at
BEFORE UPDATE ON public.ecosystem_stakeholder_suggestions
FOR EACH ROW EXECUTE FUNCTION public.discovery_set_updated_at();
CREATE INDEX ecosystem_stakeholder_suggestions_map_idx
ON public.ecosystem_stakeholder_suggestions(map_id, status);