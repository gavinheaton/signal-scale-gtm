import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import { getProjectPropresenceKey, pushAssetToPropresence } from "../_shared/propresence.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const service = createClient(supabaseUrl, serviceRoleKey);
    const { asset_id } = await req.json();
    if (!asset_id) throw new Error("asset_id required");

    const { data: asset } = await service.from("campaign_assets").select("*").eq("id", asset_id).single();
    if (!asset) throw new Error("Asset not found");

    const { data: campaign } = await service.from("campaigns")
      .select("id, name, track, project_id, projects!inner(org_id)").eq("id", asset.campaign_id).single();
    if (!campaign) throw new Error("Campaign not found");

    const { data: accessOk } = await service.rpc("user_has_org_access", {
      _user_id: user.id, _org_id: (campaign as any).projects.org_id,
    });
    if (!accessOk) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    const { apiKey, target } = await getProjectPropresenceKey(service, campaign.project_id);
    if (!apiKey) throw new Error("ProPresence not connected for this project");

    try {
      const { id, isLongForm } = await pushAssetToPropresence(asset, campaign, apiKey, target);
      await service.from("campaign_assets").update({
        propresence_id: id,
        propresence_type: isLongForm ? "article" : "post",
        propresence_pushed_at: new Date().toISOString(),
        propresence_push_error: null,
      }).eq("id", asset_id);

      return new Response(JSON.stringify({ success: true, propresence_id: id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (pushErr: any) {
      const msg = pushErr?.message || "Push failed";
      await service.from("campaign_assets").update({
        propresence_push_error: msg.slice(0, 1000),
      }).eq("id", asset_id);
      throw pushErr;
    }
  } catch (err: any) {
    console.error("push-asset-to-propresence error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
