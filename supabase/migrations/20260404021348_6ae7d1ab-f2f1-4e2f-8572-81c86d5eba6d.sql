
-- Add 'archived' to project_status enum
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'archived';

-- Create cascading delete function (security definer to bypass RLS)
CREATE OR REPLACE FUNCTION public.delete_project_cascade(_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is admin/owner/superadmin for the project's org
  IF NOT EXISTS (
    SELECT 1 FROM projects p
    JOIN org_memberships om ON om.org_id = p.org_id
    WHERE p.id = _project_id
      AND om.user_id = auth.uid()
      AND om.role IN ('admin', 'owner', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: only admin, owner, or superadmin can delete projects';
  END IF;

  -- Delete children in correct order
  DELETE FROM campaign_metrics WHERE campaign_id IN (SELECT id FROM campaigns WHERE project_id = _project_id);
  DELETE FROM campaign_assets WHERE campaign_id IN (SELECT id FROM campaigns WHERE project_id = _project_id);
  DELETE FROM campaigns WHERE project_id = _project_id;
  DELETE FROM personas WHERE project_id = _project_id;
  DELETE FROM icps WHERE project_id = _project_id;
  DELETE FROM wizard_sessions WHERE project_id = _project_id;
  DELETE FROM project_connections WHERE project_id = _project_id;
  DELETE FROM projects WHERE id = _project_id;
END;
$$;
