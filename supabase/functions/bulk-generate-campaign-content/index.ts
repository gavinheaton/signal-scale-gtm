import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { campaign_id } = await req.json();
    if (!campaign_id) {
      return new Response(JSON.stringify({ error: "campaign_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authorization: caller must belong to campaign's org
    const { data: campCheck } = await supabase
      .from("campaigns").select("id, projects!inner(org_id)").eq("id", campaign_id).maybeSingle();
    if (!campCheck) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: accessOk } = await supabase.rpc("user_has_org_access", {
      _user_id: user.id, _org_id: (campCheck as any).projects.org_id,
    });
    if (!accessOk) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // Fetch all brief-status assets for this campaign
    const { data: assets, error: assetsErr } = await supabase
      .from("campaign_assets")
      .select("*")
      .eq("campaign_id", campaign_id)
      .eq("status", "brief");

    if (assetsErr) {
      return new Response(JSON.stringify({ error: assetsErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!assets || assets.length === 0) {
      return new Response(JSON.stringify({ generated: 0, failed: 0, results: [], message: "No assets in brief status" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<{ asset_id: string; title: string; success: boolean; error?: string }> = [];

    // Generate content for each asset sequentially to avoid rate limits
    for (const asset of assets) {
      try {
        const genRes = await fetch(`${SUPABASE_URL}/functions/v1/generate-campaign-content`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": authHeader,
          },
          body: JSON.stringify({ asset_id: asset.id, campaign_id }),
        });

        if (genRes.ok) {
          results.push({ asset_id: asset.id, title: asset.title, success: true });
        } else {
          const errData = await genRes.json().catch(() => ({}));
          results.push({ asset_id: asset.id, title: asset.title, success: false, error: errData.error || "Generation failed" });
        }
      } catch (err) {
        results.push({ asset_id: asset.id, title: asset.title, success: false, error: String(err) });
      }
    }

    const generated = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return new Response(JSON.stringify({ generated, failed, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("bulk-generate-campaign-content error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
