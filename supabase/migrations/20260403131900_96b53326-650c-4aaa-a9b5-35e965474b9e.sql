
-- Create project_connections table
CREATE TABLE public.project_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('claude', 'notion')),
  api_key_secret_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, provider)
);

-- Enable RLS
ALTER TABLE public.project_connections ENABLE ROW LEVEL SECURITY;

-- RLS: users with org access can view
CREATE POLICY "Users can view project connections"
  ON public.project_connections FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_connections.project_id
        AND user_has_org_access(auth.uid(), p.org_id)
    )
  );

-- RLS: admins+ can insert
CREATE POLICY "Admins can insert project connections"
  ON public.project_connections FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN org_memberships om ON om.org_id = p.org_id AND om.user_id = auth.uid()
      WHERE p.id = project_connections.project_id
        AND om.role IN ('owner', 'admin', 'superadmin')
    )
  );

-- RLS: admins+ can update
CREATE POLICY "Admins can update project connections"
  ON public.project_connections FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN org_memberships om ON om.org_id = p.org_id AND om.user_id = auth.uid()
      WHERE p.id = project_connections.project_id
        AND om.role IN ('owner', 'admin', 'superadmin')
    )
  );

-- RLS: admins+ can delete
CREATE POLICY "Admins can delete project connections"
  ON public.project_connections FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN org_memberships om ON om.org_id = p.org_id AND om.user_id = auth.uid()
      WHERE p.id = project_connections.project_id
        AND om.role IN ('owner', 'admin', 'superadmin')
    )
  );

-- Superadmin policies
CREATE POLICY "Superadmins can manage all connections"
  ON public.project_connections FOR ALL TO authenticated
  USING (is_superadmin(auth.uid()))
  WITH CHECK (is_superadmin(auth.uid()));
