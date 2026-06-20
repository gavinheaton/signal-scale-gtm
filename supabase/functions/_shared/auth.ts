import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
export const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Verify JWT and return the authenticated user. Throws Response on failure. */
export async function requireUser(req: Request, corsHeaders: Record<string, string>) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const caller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error } = await caller.auth.getUser();
  if (error || !user) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return { user, caller, authHeader };
}

export function serviceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

/** Check the user has access to an org via org_memberships. */
export async function userHasOrgAccess(
  service: ReturnType<typeof serviceClient>,
  userId: string,
  orgId: string,
): Promise<boolean> {
  const { data, error } = await service.rpc("user_has_org_access", {
    _user_id: userId,
    _org_id: orgId,
  });
  if (error) {
    console.error("user_has_org_access RPC error:", error);
    return false;
  }
  return data === true;
}

/** Resolve the org_id for a project_id, then check membership. */
export async function assertProjectAccess(
  service: ReturnType<typeof serviceClient>,
  userId: string,
  projectId: string,
): Promise<string> {
  const { data: project, error } = await service
    .from("projects").select("id, org_id").eq("id", projectId).maybeSingle();
  if (error || !project) throw new Error("Project not found");
  const ok = await userHasOrgAccess(service, userId, project.org_id);
  if (!ok) throw new Error("Forbidden: not a member of this project's organization");
  return project.org_id;
}

/** Resolve the org_id for a campaign_id, then check membership. */
export async function assertCampaignAccess(
  service: ReturnType<typeof serviceClient>,
  userId: string,
  campaignId: string,
): Promise<{ projectId: string; orgId: string }> {
  const { data, error } = await service
    .from("campaigns")
    .select("id, project_id, projects!inner(id, org_id)")
    .eq("id", campaignId)
    .maybeSingle();
  if (error || !data) throw new Error("Campaign not found");
  const orgId = (data as any).projects.org_id as string;
  const ok = await userHasOrgAccess(service, userId, orgId);
  if (!ok) throw new Error("Forbidden: not a member of this campaign's organization");
  return { projectId: (data as any).project_id, orgId };
}

/** Resolve the org_id for an asset_id, then check membership. */
export async function assertAssetAccess(
  service: ReturnType<typeof serviceClient>,
  userId: string,
  assetId: string,
): Promise<{ campaignId: string; projectId: string; orgId: string }> {
  const { data, error } = await service
    .from("campaign_assets")
    .select("id, campaign_id, campaigns!inner(id, project_id, projects!inner(id, org_id))")
    .eq("id", assetId)
    .maybeSingle();
  if (error || !data) throw new Error("Asset not found");
  const project = (data as any).campaigns.projects;
  const ok = await userHasOrgAccess(service, userId, project.org_id);
  if (!ok) throw new Error("Forbidden: not a member of this asset's organization");
  return { campaignId: (data as any).campaign_id, projectId: project.id, orgId: project.org_id };
}

/** Resolve the org_id for an asset_image_id, then check membership. */
export async function assertAssetImageAccess(
  service: ReturnType<typeof serviceClient>,
  userId: string,
  assetImageId: string,
): Promise<{ assetId: string; orgId: string }> {
  const { data, error } = await service
    .from("asset_images")
    .select("id, asset_id, campaign_assets!inner(campaigns!inner(projects!inner(org_id)))")
    .eq("id", assetImageId)
    .maybeSingle();
  if (error || !data) throw new Error("Asset image not found");
  const orgId = (data as any).campaign_assets.campaigns.projects.org_id as string;
  const ok = await userHasOrgAccess(service, userId, orgId);
  if (!ok) throw new Error("Forbidden: not a member of this image's organization");
  return { assetId: (data as any).asset_id, orgId };
}
