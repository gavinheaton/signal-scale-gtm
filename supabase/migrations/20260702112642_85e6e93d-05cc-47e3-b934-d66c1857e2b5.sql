
-- Enums
DO $$ BEGIN
  CREATE TYPE public.value_prop_format AS ENUM ('memory_dart', 'elevator_pitch');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.value_prop_status AS ENUM ('draft', 'active', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.problem_source AS ENUM ('manual', 'ai', 'conversation');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- value_propositions
CREATE TABLE public.value_propositions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  icp_id uuid REFERENCES public.icps(id) ON DELETE SET NULL,
  persona_id uuid REFERENCES public.personas(id) ON DELETE SET NULL,
  segment_label text,
  format public.value_prop_format NOT NULL DEFAULT 'memory_dart',
  fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  statement text,
  status public.value_prop_status NOT NULL DEFAULT 'draft',
  is_primary boolean NOT NULL DEFAULT false,
  ai_rationale text,
  ai_model text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.value_propositions TO authenticated;
GRANT ALL ON public.value_propositions TO service_role;

ALTER TABLE public.value_propositions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "value_props project access" ON public.value_propositions
  FOR ALL TO authenticated
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

CREATE TRIGGER value_propositions_set_updated_at
BEFORE UPDATE ON public.value_propositions
FOR EACH ROW EXECUTE FUNCTION public.discovery_set_updated_at();

CREATE INDEX value_propositions_project_idx ON public.value_propositions(project_id);
CREATE INDEX value_propositions_icp_idx ON public.value_propositions(icp_id);

-- value_prop_problems
CREATE TABLE public.value_prop_problems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  value_prop_id uuid REFERENCES public.value_propositions(id) ON DELETE CASCADE,
  icp_id uuid REFERENCES public.icps(id) ON DELETE SET NULL,
  persona_id uuid REFERENCES public.personas(id) ON DELETE SET NULL,
  problem text NOT NULL,
  has_owner boolean NOT NULL DEFAULT false,
  tried_and_failed boolean NOT NULL DEFAULT false,
  saves_or_makes_money boolean NOT NULL DEFAULT false,
  broader_impact boolean NOT NULL DEFAULT false,
  worth_solving_score int NOT NULL DEFAULT 0,
  source public.problem_source NOT NULL DEFAULT 'manual',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.value_prop_problems TO authenticated;
GRANT ALL ON public.value_prop_problems TO service_role;

ALTER TABLE public.value_prop_problems ENABLE ROW LEVEL SECURITY;

CREATE POLICY "value_prop_problems project access" ON public.value_prop_problems
  FOR ALL TO authenticated
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

CREATE TRIGGER value_prop_problems_set_updated_at
BEFORE UPDATE ON public.value_prop_problems
FOR EACH ROW EXECUTE FUNCTION public.discovery_set_updated_at();

CREATE INDEX value_prop_problems_project_idx ON public.value_prop_problems(project_id);
CREATE INDEX value_prop_problems_vp_idx ON public.value_prop_problems(value_prop_id);
