
CREATE TABLE public.project_google_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  google_email text,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  gsc_site_url text,
  ga4_property_id text,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_google_connections TO authenticated;
GRANT ALL ON public.project_google_connections TO service_role;

ALTER TABLE public.project_google_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view google connection"
  ON public.project_google_connections FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND public.user_has_org_access(auth.uid(), p.org_id)
    )
  );

CREATE POLICY "Org admins can insert google connection"
  ON public.project_google_connections FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND public.user_has_org_role(auth.uid(), p.org_id, ARRAY['owner','admin','superadmin']::org_role[])
    )
  );

CREATE POLICY "Org admins can update google connection"
  ON public.project_google_connections FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND public.user_has_org_role(auth.uid(), p.org_id, ARRAY['owner','admin','superadmin']::org_role[])
    )
  );

CREATE POLICY "Org admins can delete google connection"
  ON public.project_google_connections FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND public.user_has_org_role(auth.uid(), p.org_id, ARRAY['owner','admin','superadmin']::org_role[])
    )
  );

CREATE TRIGGER set_project_google_connections_updated_at
  BEFORE UPDATE ON public.project_google_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_visual_settings_updated_at();
