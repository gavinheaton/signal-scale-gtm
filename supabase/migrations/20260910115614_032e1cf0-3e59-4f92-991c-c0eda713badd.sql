CREATE TABLE public.competitive_narratives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  persona_id uuid REFERENCES public.personas(id) ON DELETE SET NULL,
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  markdown text,
  model text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX competitive_narratives_project_idx ON public.competitive_narratives (project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitive_narratives TO authenticated;
GRANT ALL ON public.competitive_narratives TO service_role;

ALTER TABLE public.competitive_narratives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members manage competitive narratives" ON public.competitive_narratives FOR ALL TO authenticated
USING (project_id IN (SELECT p.id FROM public.projects p JOIN public.org_memberships om ON om.org_id = p.org_id WHERE om.user_id = auth.uid()))
WITH CHECK (project_id IN (SELECT p.id FROM public.projects p JOIN public.org_memberships om ON om.org_id = p.org_id WHERE om.user_id = auth.uid()));

CREATE TRIGGER update_competitive_narratives_updated_at BEFORE UPDATE ON public.competitive_narratives
FOR EACH ROW EXECUTE FUNCTION public.discovery_set_updated_at();