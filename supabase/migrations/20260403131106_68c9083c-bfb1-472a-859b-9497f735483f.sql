
-- Security definer function to check if a user is a superadmin
CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_memberships
    WHERE user_id = _user_id AND role = 'superadmin'
  )
$$;

-- Superadmins can view ALL organisations
CREATE POLICY "Superadmins can view all orgs"
ON public.organisations
FOR SELECT
TO authenticated
USING (public.is_superadmin(auth.uid()));

-- Superadmins can insert organisations
CREATE POLICY "Superadmins can insert orgs"
ON public.organisations
FOR INSERT
TO authenticated
WITH CHECK (public.is_superadmin(auth.uid()));

-- Superadmins can update organisations
CREATE POLICY "Superadmins can update orgs"
ON public.organisations
FOR UPDATE
TO authenticated
USING (public.is_superadmin(auth.uid()));

-- Superadmins can view ALL org memberships
CREATE POLICY "Superadmins can view all memberships"
ON public.org_memberships
FOR SELECT
TO authenticated
USING (public.is_superadmin(auth.uid()));

-- Superadmins can insert memberships into any org
CREATE POLICY "Superadmins can insert memberships"
ON public.org_memberships
FOR INSERT
TO authenticated
WITH CHECK (public.is_superadmin(auth.uid()));

-- Org admins can view memberships within their own org
CREATE POLICY "Org admins can view org memberships"
ON public.org_memberships
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.org_memberships om
    WHERE om.user_id = auth.uid()
      AND om.org_id = org_memberships.org_id
      AND om.role IN ('owner', 'admin')
  )
);

-- Org admins can insert memberships within their own org
CREATE POLICY "Org admins can insert org memberships"
ON public.org_memberships
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.org_memberships om
    WHERE om.user_id = auth.uid()
      AND om.org_id = org_memberships.org_id
      AND om.role IN ('owner', 'admin')
  )
);

-- Superadmins can view ALL projects
CREATE POLICY "Superadmins can view all projects"
ON public.projects
FOR SELECT
TO authenticated
USING (public.is_superadmin(auth.uid()));
