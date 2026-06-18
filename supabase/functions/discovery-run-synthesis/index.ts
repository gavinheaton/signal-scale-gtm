// Cluster all observation insights for a campaign into proposed themes, ranked by frequency.
import { corsHeaders } from "../_shared/cors.ts";
import { requireUser, serviceClient, assertProjectAccess } from "../_shared/auth.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

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
    const { data: c, error: cErr } = await sb.from("discovery_campaigns").select("project_id").eq("id", campaign_id).maybeSingle();
    if (cErr || !c) return json({ error: "Campaign not found" }, 404);
    try { await assertProjectAccess(sb, user.id, c.project_id); }
    catch (e: any) { return json({ error: e?.message || "Forbidden" }, 403); }

    const { data: insights } = await sb.from("discovery_insights")
      .select("id, text, is_quote").eq("campaign_id", campaign_id).eq("kind", "observation");
    const list = insights || [];
    if (list.length < 5) return json({ error: "Not enough insights to synthesise" }, 400);

    const ai = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: `You cluster customer-discovery observations into themes. Return ONLY JSON: {"themes":[{"label":string,"description":string,"supporting_insight_ids":string[],"conflicts_with_theme_label":string|null}]}. Hard rules: every supporting_insight_ids value MUST be one of the provided insight ids; sort themes by supporting count descending; set conflicts_with_theme_label when one theme directly contradicts another theme in the list; produce 3-8 themes.` },
          { role: "user", content: JSON.stringify({ insights: list.map((i) => ({ id: i.id, text: i.text, is_quote: i.is_quote })) }) },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!ai.ok) return json({ error: `AI failed: ${ai.status}` }, 502);
    const data = await ai.json();
    let parsed: any = {};
    try { parsed = JSON.parse(data?.choices?.[0]?.message?.content); } catch { /* ignore */ }
    return json({ themes: parsed.themes || [] });
  } catch (e: any) {
    console.error(e);
    return json({ error: e?.message || "Internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
