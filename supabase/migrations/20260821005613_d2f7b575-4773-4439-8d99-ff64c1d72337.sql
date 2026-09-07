CREATE TABLE public.value_prop_variations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  value_prop_id uuid NOT NULL REFERENCES public.value_propositions(id) ON DELETE CASCADE,
  icp_id uuid REFERENCES public.icps(id) ON DELETE SET NULL,
  persona_id uuid REFERENCES public.personas(id) ON DELETE SET NULL,
  label text,
  angle text,
  statement text NOT NULL,
  is_selected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.value_prop_variations TO authenticated;
GRANT ALL ON public.value_prop_variations TO service_role;

ALTER TABLE public.value_prop_variations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "value_prop_variations project access"
ON public.value_prop_variations
FOR ALL
TO authenticated
USING (project_id IN (SELECT p.id FROM public.projects p JOIN public.org_memberships om ON om.org_id = p.org_id WHERE om.user_id = auth.uid()))
WITH CHECK (project_id IN (SELECT p.id FROM public.projects p JOIN public.org_memberships om ON om.org_id = p.org_id WHERE om.user_id = auth.uid()));

CREATE INDEX value_prop_variations_value_prop_idx ON public.value_prop_variations(value_prop_id);

CREATE TRIGGER value_prop_variations_set_updated_at
BEFORE UPDATE ON public.value_prop_variations
FOR EACH ROW EXECUTE FUNCTION public.discovery_set_updated_at();