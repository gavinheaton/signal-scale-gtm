// Deterministic auto-fill for the Disruptors Canvas from platform data.
// Wipes prior source='auto' entries for the canvas and rebuilds.
import { corsHeaders } from "../_shared/cors.ts";
import { requireUser, serviceClient, assertProjectAccess } from "../_shared/auth.ts";

interface Body { canvas_id: string }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { user } = await requireUser(req, corsHeaders);
    const { canvas_id } = (await req.json()) as Body;
    if (!canvas_id) throw new Error("canvas_id required");
    const svc = serviceClient();

    const { data: canvas, error: cErr } = await svc
      .from("canvases").select("id, project_id, variant").eq("id", canvas_id).maybeSingle();
    if (cErr || !canvas) throw new Error("Canvas not found");
    await assertProjectAccess(svc, user.id, canvas.project_id);

    const projectId = canvas.project_id as string;

    const [icpsR, vpR, vppR, campsR, insightsR, metricsR] = await Promise.all([
      svc.from("icps").select("id, segment_name, firmographics, matrix_category").eq("project_id", projectId),
      svc.from("value_propositions").select("id, statement, fields, is_primary").eq("project_id", projectId),
      svc.from("value_prop_problems").select("problem, worth_solving_score").eq("project_id", projectId).order("worth_solving_score", { ascending: false }).limit(6),
      svc.from("campaigns").select("id, name, objective, channel_mix, target_icp_ids").eq("project_id", projectId),
      svc.from("discovery_insights").select("id, text, kind, campaign_id").in("campaign_id",
        (await svc.from("discovery_campaigns").select("id").eq("project_id", projectId)).data?.map((r: any) => r.id) || []),
      svc.from("campaign_metrics").select("brand_search_volume, inbound_referrals, pipeline_influenced, share_of_voice_pct, community_engagement, conversion_rate_pct").limit(50),
    ]);

    const icps = (icpsR.data || []) as any[];
    const vps = (vpR.data || []) as any[];
    const problems = (vppR.data || []) as any[];
    const campaigns = (campsR.data || []) as any[];
    const insights = (insightsR.data || []) as any[];
    const metrics = (metricsR.data || []) as any[];

    // Wipe prior auto entries
    await svc.from("canvas_entries").delete().eq("canvas_id", canvas_id).eq("source", "auto");

    const rows: any[] = [];
    let pos = 0;
    const add = (box: string, content: string, source_ref: any = null) => {
      if (!content) return;
      rows.push({
        canvas_id, box, content: content.slice(0, 500), status: "assumption",
        source: "auto", source_ref, position: pos++,
      });
    };

    // Problem — top problems
    for (const p of problems) add("problem", p.problem, { table: "value_prop_problems" });

    // Solution — primary VP first
    const primary = vps.find((v) => v.is_primary) || vps[0];
    if (primary?.statement) add("solution", primary.statement, { table: "value_propositions", id: primary.id });
    for (const c of campaigns.slice(0, 3)) if (c.objective) add("solution", c.objective, { table: "campaigns", id: c.id });

    // Customer Segments — ICPs
    for (const icp of icps) {
      const firm = icp.firmographics as any;
      const bits = [firm?.industry, firm?.company_size, firm?.geography].filter(Boolean).join(" · ");
      add("customer_segments", `${icp.segment_name}${bits ? ` — ${bits}` : ""}`, { table: "icps", id: icp.id });
    }

    // Unfair Advantage — from discovery insights labelled advantage/differentiator
    for (const i of insights) {
      const k = (i.kind || "").toLowerCase();
      if (k.includes("advantage") || k.includes("differ")) {
        add("unfair_advantage", i.text, { table: "discovery_insights", id: i.id });
      }
    }

    // Channels — from campaign channel_mix
    const channels = new Set<string>();
    for (const c of campaigns) {
      const mix = c.channel_mix as any;
      if (Array.isArray(mix)) mix.forEach((m: any) => channels.add(typeof m === "string" ? m : m?.name).valueOf());
      else if (mix && typeof mix === "object") Object.keys(mix).forEach((k) => channels.add(k));
    }
    for (const ch of channels) if (ch) add("channels", ch, { table: "campaigns" });

    // Metrics — surface those that have non-zero values
    if (metrics.length) {
      const totals: Record<string, number> = {};
      for (const m of metrics) for (const [k, v] of Object.entries(m)) totals[k] = (totals[k] || 0) + Number(v || 0);
      const labels: Record<string, string> = {
        brand_search_volume: "Brand search volume",
        inbound_referrals: "Inbound referrals",
        pipeline_influenced: "Pipeline influenced ($)",
        share_of_voice_pct: "Share of voice (%)",
        community_engagement: "Community engagement",
        conversion_rate_pct: "Conversion rate (%)",
      };
      for (const [k, v] of Object.entries(totals)) if (v > 0) add("metrics", labels[k] || k, { table: "campaign_metrics" });
    }

    let inserted = 0;
    if (rows.length) {
      const { error, count } = await svc.from("canvas_entries").insert(rows, { count: "exact" });
      if (error) throw error;
      inserted = count || rows.length;
    }

    return Response.json({ ok: true, inserted }, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return new Response(JSON.stringify({ error: e.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
