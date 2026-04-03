

# Fix: Infinite Recursion in `org_memberships` RLS Policies

## Problem
The `org_memberships` table has a SELECT policy ("Org admins can view org memberships") that queries `org_memberships` within its own USING expression. When Postgres evaluates this policy, it triggers RLS on the same table, causing infinite recursion → 500 error.

The "Superadmins can view all memberships" policy uses `is_superadmin()` which is SECURITY DEFINER (safe), and "Users can view own memberships" is a simple `user_id = auth.uid()` (safe). But the admin policy is the problem.

Similarly, the INSERT policies for org admins have the same self-referencing pattern.

## Fix

### Migration: Replace self-referencing policies with security definer function calls

1. **Create a security definer function** `user_has_org_role` that checks if a user has a specific role in an org — bypasses RLS since it runs as the function owner:

```sql
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
```

2. **Drop and recreate the recursive policies** on `org_memberships`:

- **SELECT** "Org admins can view org memberships": replace subquery with `user_has_org_role(auth.uid(), org_memberships.org_id, ARRAY['owner','admin']::org_role[])`
- **INSERT** "Org admins can insert org memberships": same pattern

## Files
- **Create**: One SQL migration with the function + policy replacements

## Scope
Database-only change. No frontend code modifications needed.

