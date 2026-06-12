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
    const { campaign_id } = await req.json();
    if (!campaign_id) throw new Error("campaign_id required");

    const { data: campaign } = await service.from("campaigns")
      .select("id, name, track, project_id").eq("id", campaign_id).single();
    if (!campaign) throw new Error("Campaign not found");

    const { apiKey, target } = await getProjectPropresenceKey(service, campaign.project_id);
    if (!apiKey) throw new Error("ProPresence not connected for this project");

    const { data: assets } = await service.from("campaign_assets")
      .select("*")
      .eq("campaign_id", campaign_id)
      .in("status", ["approved", "published"])
      .is("propresence_id", null);

    const list = assets || [];
    let pushed = 0;
    let failed = 0;
    const errors: { asset_id: string; error: string }[] = [];

    // Small sequential loop with concurrency 3
    const CONCURRENCY = 3;
    for (let i = 0; i < list.length; i += CONCURRENCY) {
      const batch = list.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async (asset) => {
        try {
          const { id, isLongForm } = await pushAssetToPropresence(asset, campaign, apiKey, target);
          await service.from("campaign_assets").update({
            propresence_id: id,
            propresence_type: isLongForm ? "article" : "post",
            propresence_pushed_at: new Date().toISOString(),
            propresence_push_error: null,
          }).eq("id", asset.id);
          pushed++;
        } catch (e: any) {
          failed++;
          const msg = e?.message || "Push failed";
          errors.push({ asset_id: asset.id, error: msg });
          await service.from("campaign_assets").update({
            propresence_push_error: msg.slice(0, 1000),
          }).eq("id", asset.id);
        }
      }));
    }

    return new Response(JSON.stringify({
      success: true, total: list.length, pushed, failed, errors,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("bulk-push-campaign-to-propresence error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
