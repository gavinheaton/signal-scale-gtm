-- Enums
CREATE TYPE public.competitor_type AS ENUM ('direct','adjacent','in_house','do_nothing');
CREATE TYPE public.competitor_status AS ENUM ('suggested','confirmed','dismissed');
CREATE TYPE public.competitor_rating AS ENUM ('strong','parity','weak');
CREATE TYPE public.whitespace_kind AS ENUM ('unowned','commoditised','counter_position');

-- competitors
CREATE TABLE public.competitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  domain text,
  linkedin_url text,
  type public.competitor_type NOT NULL DEFAULT 'direct',
  status public.competitor_status NOT NULL DEFAULT 'suggested',
  why_suggested text,
  positioning text,
  target_segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  claims jsonb NOT NULL DEFAULT '[]'::jsonb,
  proof_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  pricing_signals text,
  strengths jsonb NOT NULL DEFAULT '[]'::jsonb,
  weaknesses jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence text,
  notes text,
  researched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitors TO authenticated;
GRANT ALL ON public.competitors TO service_role;
ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members manage competitors" ON public.competitors FOR ALL TO authenticated
USING (project_id IN (SELECT p.id FROM public.projects p JOIN public.org_memberships om ON om.org_id = p.org_id WHERE om.user_id = auth.uid()))
WITH CHECK (project_id IN (SELECT p.id FROM public.projects p JOIN public.org_memberships om ON om.org_id = p.org_id WHERE om.user_id = auth.uid()));
CREATE TRIGGER competitors_set_updated_at BEFORE UPDATE ON public.competitors FOR EACH ROW EXECUTE FUNCTION public.discovery_set_updated_at();
CREATE INDEX competitors_project_idx ON public.competitors(project_id);

-- competitor_dimensions
CREATE TABLE public.competitor_dimensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  label text NOT NULL,
  description text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitor_dimensions TO authenticated;
GRANT ALL ON public.competitor_dimensions TO service_role;
ALTER TABLE public.competitor_dimensions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members manage competitor dimensions" ON public.competitor_dimensions FOR ALL TO authenticated
USING (project_id IN (SELECT p.id FROM public.projects p JOIN public.org_memberships om ON om.org_id = p.org_id WHERE om.user_id = auth.uid()))
WITH CHECK (project_id IN (SELECT p.id FROM public.projects p JOIN public.org_memberships om ON om.org_id = p.org_id WHERE om.user_id = auth.uid()));
CREATE TRIGGER competitor_dimensions_set_updated_at BEFORE UPDATE ON public.competitor_dimensions FOR EACH ROW EXECUTE FUNCTION public.discovery_set_updated_at();
CREATE INDEX competitor_dimensions_project_idx ON public.competitor_dimensions(project_id);

-- competitor_scores
CREATE TABLE public.competitor_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  dimension_id uuid NOT NULL REFERENCES public.competitor_dimensions(id) ON DELETE CASCADE,
  competitor_id uuid REFERENCES public.competitors(id) ON DELETE CASCADE,
  claim text,
  rating public.competitor_rating,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX competitor_scores_unique_idx ON public.competitor_scores(dimension_id, COALESCE(competitor_id, '00000000-0000-0000-0000-000000000000'::uuid));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitor_scores TO authenticated;
GRANT ALL ON public.competitor_scores TO service_role;
ALTER TABLE public.competitor_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members manage competitor scores" ON public.competitor_scores FOR ALL TO authenticated
USING (project_id IN (SELECT p.id FROM public.projects p JOIN public.org_memberships om ON om.org_id = p.org_id WHERE om.user_id = auth.uid()))
WITH CHECK (project_id IN (SELECT p.id FROM public.projects p JOIN public.org_memberships om ON om.org_id = p.org_id WHERE om.user_id = auth.uid()));
CREATE TRIGGER competitor_scores_set_updated_at BEFORE UPDATE ON public.competitor_scores FOR EACH ROW EXECUTE FUNCTION public.discovery_set_updated_at();

-- competitive_whitespace
CREATE TABLE public.competitive_whitespace (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  kind public.whitespace_kind NOT NULL,
  title text NOT NULL,
  rationale text,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  applied_to jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitive_whitespace TO authenticated;
GRANT ALL ON public.competitive_whitespace TO service_role;
ALTER TABLE public.competitive_whitespace ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members manage whitespace" ON public.competitive_whitespace FOR ALL TO authenticated
USING (project_id IN (SELECT p.id FROM public.projects p JOIN public.org_memberships om ON om.org_id = p.org_id WHERE om.user_id = auth.uid()))
WITH CHECK (project_id IN (SELECT p.id FROM public.projects p JOIN public.org_memberships om ON om.org_id = p.org_id WHERE om.user_id = auth.uid()));
CREATE TRIGGER competitive_whitespace_set_updated_at BEFORE UPDATE ON public.competitive_whitespace FOR EACH ROW EXECUTE FUNCTION public.discovery_set_updated_at();
CREATE INDEX competitive_whitespace_project_idx ON public.competitive_whitespace(project_id);

-- competitor_runs (background jobs)
CREATE TABLE public.competitor_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  target_id uuid,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  saved_count integer NOT NULL DEFAULT 0,
  error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitor_runs TO authenticated;
GRANT ALL ON public.competitor_runs TO service_role;
ALTER TABLE public.competitor_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members manage competitor runs" ON public.competitor_runs FOR ALL TO authenticated
USING (project_id IN (SELECT p.id FROM public.projects p JOIN public.org_memberships om ON om.org_id = p.org_id WHERE om.user_id = auth.uid()))
WITH CHECK (project_id IN (SELECT p.id FROM public.projects p JOIN public.org_memberships om ON om.org_id = p.org_id WHERE om.user_id = auth.uid()));
CREATE TRIGGER competitor_runs_set_updated_at BEFORE UPDATE ON public.competitor_runs FOR EACH ROW EXECUTE FUNCTION public.discovery_set_updated_at();
CREATE INDEX competitor_runs_project_idx ON public.competitor_runs(project_id, created_at DESC);