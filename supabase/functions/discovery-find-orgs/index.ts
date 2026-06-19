// Find organisations matching a discovery campaign's ICP + signals using Firecrawl + Lovable AI.
import { corsHeaders } from "../_shared/cors.ts";
import { requireUser, serviceClient, assertProjectAccess } from "../_shared/auth.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY")!;

interface Body { campaign_id: string }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    let user;
    try { ({ user } = await requireUser(req, corsHeaders)); }
    catch (r) { return r as Response; }

    const { campaign_id }: Body = await req.json();
    if (!campaign_id) return json({ error: "campaign_id required" }, 400);

    const sb = serviceClient();
    const { data: campaign, error } = await sb.from("discovery_campaigns").select("*").eq("id", campaign_id).maybeSingle();
    if (error || !campaign) return json({ error: "Campaign not found" }, 404);
    try { await assertProjectAccess(sb, user.id, campaign.project_id); }
    catch (e: any) { return json({ error: e?.message || "Forbidden" }, 403); }

    if (!FIRECRAWL_API_KEY) return json({ error: "FIRECRAWL_API_KEY not configured" }, 500);

    // Build a search query from target segment + qualifying signals
    const q = [
      campaign.target_segment || "",
      ...(campaign.qualifying_signals || []).slice(0, 3),
    ].filter(Boolean).join(" ");
    console.log("[find-orgs] query:", q, "campaign:", campaign_id);
    const searchRes = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: q, limit: 10 }),
    });
    const rawText = await searchRes.text();
    console.log("[find-orgs] firecrawl status:", searchRes.status, "body preview:", rawText.slice(0, 800));
    if (!searchRes.ok) return json({ error: `Firecrawl search failed: ${searchRes.status}`, detail: rawText.slice(0, 500) }, 502);
    let searchData: any = {};
    try { searchData = JSON.parse(rawText); } catch { /* leave empty */ }
    let hits: any[] = [];
    if (Array.isArray(searchData?.data)) hits = searchData.data;
    else if (Array.isArray(searchData?.data?.web)) hits = searchData.data.web;
    else if (Array.isArray(searchData?.web?.results)) hits = searchData.web.results;
    else if (Array.isArray(searchData?.web)) hits = searchData.web;
    else if (Array.isArray(searchData?.results)) hits = searchData.results;

    console.log("[find-orgs] hits:", hits.length, "keys:", Object.keys(searchData || {}), "data keys:", Object.keys(searchData?.data || {}));

    if (hits.length === 0) {
      return json({
        candidates: [],
        debug: {
          query: q,
          firecrawl_status: searchRes.status,
          top_level_keys: Object.keys(searchData || {}),
          data_keys: Object.keys(searchData?.data || {}),
          body_preview: rawText.slice(0, 400),
        },
      });
    }
    const mappedHits = hits.slice(0, 10).map((h: any) => ({
      title: h.title || h.name || "",
      url: h.url || h.link || h.sourceURL || h?.metadata?.sourceURL || "",
      description: h.description || h.snippet || h.summary || (typeof h.markdown === "string" ? h.markdown.slice(0, 400) : ""),
    }));

    // Score with AI
    const ai = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: `You score organisations against an Ideal Customer Profile. Return ONLY JSON with shape: {"candidates":[{"name":string,"domain":string,"suggested_tier":string,"matched_signals":string[],"rationale":string,"source_url":string}]}. matched_signals must be a subset of the provided qualifying_signals. suggested_tier must be one of the provided tier labels. Skip any org clearly matching a disqualifying_signal.` },
          { role: "user", content: JSON.stringify({
            target_segment: campaign.target_segment,
            qualifying_signals: campaign.qualifying_signals,
            disqualifying_signals: campaign.disqualifying_signals,
            tiers: (campaign.tiers || []).map((t: any) => t.label),
            search_results: mappedHits,
          }) },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!ai.ok) return json({ error: `AI scoring failed: ${ai.status}` }, 502);
    const aiData = await ai.json();
    const text = aiData?.choices?.[0]?.message?.content as string;
    let parsed: any = {};
    try { parsed = JSON.parse(text); } catch { /* fallback */ }
    return json({ candidates: parsed.candidates || [] });
  } catch (e: any) {
    console.error(e);
    return json({ error: e?.message || "Internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
