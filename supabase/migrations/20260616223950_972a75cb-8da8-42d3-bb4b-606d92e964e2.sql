
CREATE TYPE public.brand_audit_status AS ENUM ('queued', 'running', 'completed', 'failed');
CREATE TYPE public.brand_audit_scope AS ENUM ('quick', 'deep', 'custom');
CREATE TYPE public.brand_audit_page_status AS ENUM ('on_brand', 'drifting', 'off_brand');

CREATE TABLE public.brand_audit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  scope brand_audit_scope NOT NULL DEFAULT 'quick',
  status brand_audit_status NOT NULL DEFAULT 'queued',
  base_url text NOT NULL,
  custom_urls text[],
  page_limit int NOT NULL DEFAULT 10,
  pages_total int NOT NULL DEFAULT 0,
  pages_scored int NOT NULL DEFAULT 0,
  headline_score int,
  voice_score int,
  icp_score int,
  persona_score int,
  clarity_score int,
  summary text,
  error_message text,
  triggered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_brand_audit_runs_project ON public.brand_audit_runs(project_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_audit_runs TO authenticated;
GRANT ALL ON public.brand_audit_runs TO service_role;
ALTER TABLE public.brand_audit_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view brand audit runs"
  ON public.brand_audit_runs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = brand_audit_runs.project_id AND public.user_has_org_access(auth.uid(), p.org_id)));

CREATE POLICY "Org members can create brand audit runs"
  ON public.brand_audit_runs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = brand_audit_runs.project_id AND public.user_has_org_access(auth.uid(), p.org_id)));

CREATE POLICY "Org members can update brand audit runs"
  ON public.brand_audit_runs FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = brand_audit_runs.project_id AND public.user_has_org_access(auth.uid(), p.org_id)));

CREATE POLICY "Org admins can delete brand audit runs"
  ON public.brand_audit_runs FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = brand_audit_runs.project_id AND public.user_has_org_role(auth.uid(), p.org_id, ARRAY['owner','admin','superadmin']::org_role[])));

CREATE TABLE public.brand_audit_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.brand_audit_runs(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  url text NOT NULL,
  title text,
  page_status brand_audit_page_status,
  headline_score int,
  voice_score int,
  icp_score int,
  persona_score int,
  clarity_score int,
  voice_reasoning text,
  icp_reasoning text,
  persona_reasoning text,
  clarity_reasoning text,
  matched_personas uuid[],
  matched_icps uuid[],
  suggested_rewrite text,
  excerpt text,
  word_count int,
  scrape_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_brand_audit_pages_run ON public.brand_audit_pages(run_id);
CREATE INDEX idx_brand_audit_pages_project ON public.brand_audit_pages(project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_audit_pages TO authenticated;
GRANT ALL ON public.brand_audit_pages TO service_role;
ALTER TABLE public.brand_audit_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view brand audit pages"
  ON public.brand_audit_pages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = brand_audit_pages.project_id AND public.user_has_org_access(auth.uid(), p.org_id)));

CREATE POLICY "Org members can insert brand audit pages"
  ON public.brand_audit_pages FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = brand_audit_pages.project_id AND public.user_has_org_access(auth.uid(), p.org_id)));

CREATE POLICY "Org members can update brand audit pages"
  ON public.brand_audit_pages FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = brand_audit_pages.project_id AND public.user_has_org_access(auth.uid(), p.org_id)));

CREATE POLICY "Org admins can delete brand audit pages"
  ON public.brand_audit_pages FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = brand_audit_pages.project_id AND public.user_has_org_role(auth.uid(), p.org_id, ARRAY['owner','admin','superadmin']::org_role[])));

CREATE TRIGGER trg_brand_audit_runs_updated_at
  BEFORE UPDATE ON public.brand_audit_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_visual_settings_updated_at();
