
-- 1. Create security definer function to check org roles without triggering RLS
CREATE OR REPLACE FUNCTION public.user_has_org_role(
  _user_id uuid, _org_id uuid, _roles org_role[]
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_memberships
    WHERE user_id = _user_id AND org_id = _org_id AND role = ANY(_roles)
  )
$$;

-- 2. Drop recursive SELECT policy and recreate with function call
DROP POLICY IF EXISTS "Org admins can view org memberships" ON public.org_memberships;
CREATE POLICY "Org admins can view org memberships"
  ON public.org_memberships FOR SELECT TO authenticated
  USING (user_has_org_role(auth.uid(), org_id, ARRAY['owner','admin']::org_role[]));

-- 3. Drop recursive INSERT policy and recreate with function call
DROP POLICY IF EXISTS "Org admins can insert org memberships" ON public.org_memberships;
CREATE POLICY "Org admins can insert org memberships"
  ON public.org_memberships FOR INSERT TO authenticated
  WITH CHECK (user_has_org_role(auth.uid(), org_id, ARRAY['owner','admin']::org_role[]));
