import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ASSET_TYPES = ["blog", "video", "podcast", "linkedin_post", "email", "webinar", "whitepaper", "press_release"] as const;
type AssetType = typeof ASSET_TYPES[number];

function mapAssetType(item: any): AssetType {
  const raw = `${item.format ?? ""} ${item.channel ?? ""} ${item.content_type ?? ""}`.toLowerCase();
  if (raw.includes("email") || raw.includes("newsletter") || raw.includes("the lens")) return "email";
  if (raw.includes("linkedin")) return "linkedin_post";
  if (raw.includes("video")) return "video";
  if (raw.includes("podcast")) return "podcast";
  if (raw.includes("webinar")) return "webinar";
  if (raw.includes("whitepaper") || raw.includes("white paper")) return "whitepaper";
  if (raw.includes("press")) return "press_release";
  return "blog";
}

function objectiveSummary(draft: any): string {
  const obj = draft?.objective;
  if (!obj) return "";
  if (typeof obj === "string") return obj;
  if (typeof obj === "object") {
    const primary = obj.primary || obj.goal || obj.statement || "";
    const desc = obj.description || obj.text || "";
    const parts = [primary, desc].filter(Boolean);
    if (parts.length) return parts.join(" — ");
    return JSON.stringify(obj);
  }
  return String(obj);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: authError } = await userClient.auth.getClaims(token);
    if (authError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    const { session_id, track: trackOverride } = await req.json();
    if (!session_id) {
      return new Response(JSON.stringify({ error: "session_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Load session
    const { data: session, error: sessionError } = await admin
      .from("wizard_sessions")
      .select("*, projects!inner(id, org_id, name)")
      .eq("id", session_id)
      .single();

    if (sessionError || !session) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller has org access
    const { data: hasAccess } = await admin.rpc("user_has_org_access", {
      _user_id: userId,
      _org_id: (session as any).projects.org_id,
    });
    if (!hasAccess) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const draft = (session.draft_output as any) || {};
    const projectId = session.project_id;

    if (session.session_type !== "campaign") {
      return new Response(JSON.stringify({ error: "Session is not a campaign wizard" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const calendar: any[] = Array.isArray(draft.content_calendar) ? draft.content_calendar : [];
    if (calendar.length === 0) {
      return new Response(JSON.stringify({ error: "Draft has no content calendar to recover" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const campaignName = draft.campaign_name || `Recovered campaign ${session_id.slice(0, 8)}`;

    // Resolve target_icp_ids best-effort by name match
    let targetIcpIds: string[] = [];
    const ta = draft.target_audience;
    const candidateNames: string[] = [];
    if (ta) {
      if (Array.isArray(ta?.segments)) candidateNames.push(...ta.segments.map((s: any) => typeof s === "string" ? s : s?.name).filter(Boolean));
      if (Array.isArray(ta?.icps)) candidateNames.push(...ta.icps.map((s: any) => typeof s === "string" ? s : s?.name).filter(Boolean));
      if (Array.isArray(ta?.icp_ids)) targetIcpIds.push(...ta.icp_ids.filter((x: any) => typeof x === "string"));
    }
    if (candidateNames.length && targetIcpIds.length === 0) {
      const { data: icps } = await admin.from("icps").select("id, segment_name").eq("project_id", projectId);
      if (icps) {
        const lower = candidateNames.map(n => n.toLowerCase());
        targetIcpIds = (icps as any[])
          .filter(icp => lower.some(n => icp.segment_name?.toLowerCase().includes(n) || n.includes(icp.segment_name?.toLowerCase() || "")))
          .map(icp => icp.id);
      }
    }

    const track = trackOverride || draft.track || "demand_creation";

    // Insert campaign
    const { data: campaign, error: campaignError } = await admin
      .from("campaigns")
      .insert({
        project_id: projectId,
        name: campaignName,
        track,
        status: "planning",
        objective: objectiveSummary(draft),
        target_icp_ids: targetIcpIds,
        channel_mix: draft.channel_mix || {},
        launch_date: draft.launch_date || null,
        end_date: draft.end_date || null,
      })
      .select("id")
      .single();

    if (campaignError || !campaign) {
      console.error("Campaign insert error:", campaignError);
      return new Response(JSON.stringify({ error: campaignError?.message || "Failed to create campaign" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const campaignId = campaign.id;

    // First pass: insert assets without depends_on
    const inserts = calendar.map((item: any, idx: number) => ({
      campaign_id: campaignId,
      asset_type: mapAssetType(item),
      title: item.title || `Asset ${idx + 1}`,
      status: "brief" as const,
      publish_date: item.publish_date || null,
      production_due: item.production_due || null,
      sequence_order: item.sequence_order ?? (idx + 1),
      offset_days: item.offset_days ?? null,
      rationale: item.rationale || null,
      persona_target_ids: [],
    }));

    const { data: insertedAssets, error: assetsError } = await admin
      .from("campaign_assets")
      .insert(inserts)
      .select("id, sequence_order");

    if (assetsError) {
      console.error("Assets insert error:", assetsError);
      // Rollback campaign
      await admin.from("campaigns").delete().eq("id", campaignId);
      return new Response(JSON.stringify({ error: assetsError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Second pass: resolve depends_on (sequence_order → uuid)
    const seqToId = new Map<number, string>();
    for (const a of insertedAssets || []) {
      if (a.sequence_order != null) seqToId.set(a.sequence_order, a.id);
    }
    const depUpdates: Promise<any>[] = [];
    calendar.forEach((item: any, idx: number) => {
      const dep = item.depends_on;
      if (typeof dep === "number" && seqToId.has(dep)) {
        const seq = item.sequence_order ?? (idx + 1);
        const myId = seqToId.get(seq);
        const depId = seqToId.get(dep);
        if (myId && depId && myId !== depId) {
          depUpdates.push(admin.from("campaign_assets").update({ depends_on: depId }).eq("id", myId));
        }
      }
    });
    if (depUpdates.length) await Promise.all(depUpdates);

    // Mark wizard session complete
    await admin
      .from("wizard_sessions")
      .update({
        status: "complete",
        draft_output: { ...draft, is_complete: true, recovered_campaign_id: campaignId },
      })
      .eq("id", session_id);

    return new Response(
      JSON.stringify({
        campaign_id: campaignId,
        asset_count: insertedAssets?.length || 0,
        campaign_name: campaignName,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("recover-wizard-campaign error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
