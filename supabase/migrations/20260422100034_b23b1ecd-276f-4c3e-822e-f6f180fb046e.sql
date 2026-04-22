-- Enum for WordPress flavour
DO $$ BEGIN
  CREATE TYPE public.wp_flavor AS ENUM ('wordpress_com', 'self_hosted');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Org-level WordPress connections
CREATE TABLE IF NOT EXISTS public.org_wordpress_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL UNIQUE REFERENCES public.organisations(id) ON DELETE CASCADE,
  flavor public.wp_flavor NOT NULL,
  site_url text NOT NULL,
  username text,
  credential_secret_id uuid NOT NULL,
  default_category text,
  default_status text NOT NULL DEFAULT 'draft',
  connected_by uuid,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.org_wordpress_connections ENABLE ROW LEVEL SECURITY;

-- Only org admins/owners/superadmins manage connections
CREATE POLICY "Org admins can view wp connections"
ON public.org_wordpress_connections FOR SELECT
TO authenticated
USING (
  user_has_org_role(auth.uid(), org_id, ARRAY['owner'::org_role, 'admin'::org_role, 'superadmin'::org_role])
  OR is_superadmin(auth.uid())
);

CREATE POLICY "Org admins can insert wp connections"
ON public.org_wordpress_connections FOR INSERT
TO authenticated
WITH CHECK (
  user_has_org_role(auth.uid(), org_id, ARRAY['owner'::org_role, 'admin'::org_role, 'superadmin'::org_role])
  OR is_superadmin(auth.uid())
);

CREATE POLICY "Org admins can update wp connections"
ON public.org_wordpress_connections FOR UPDATE
TO authenticated
USING (
  user_has_org_role(auth.uid(), org_id, ARRAY['owner'::org_role, 'admin'::org_role, 'superadmin'::org_role])
  OR is_superadmin(auth.uid())
);

CREATE POLICY "Org admins can delete wp connections"
ON public.org_wordpress_connections FOR DELETE
TO authenticated
USING (
  user_has_org_role(auth.uid(), org_id, ARRAY['owner'::org_role, 'admin'::org_role, 'superadmin'::org_role])
  OR is_superadmin(auth.uid())
);

-- Trigger to maintain updated_at
CREATE TRIGGER org_wp_conn_updated_at
BEFORE UPDATE ON public.org_wordpress_connections
FOR EACH ROW EXECUTE FUNCTION public.update_visual_settings_updated_at();

-- Safe-read RPC: any org member can view non-sensitive details about their org's WP connection
CREATE OR REPLACE FUNCTION public.get_my_org_wp_connection(_org_id uuid)
RETURNS TABLE (
  id uuid,
  org_id uuid,
  flavor public.wp_flavor,
  site_url text,
  username text,
  default_category text,
  default_status text,
  connected_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.org_id, c.flavor, c.site_url, c.username,
         c.default_category, c.default_status, c.connected_at, c.updated_at
  FROM public.org_wordpress_connections c
  WHERE c.org_id = _org_id
    AND public.user_has_org_access(auth.uid(), _org_id);
$$;

GRANT EXECUTE ON FUNCTION public.get_my_org_wp_connection(uuid) TO authenticated;
