// Suggest qualifying signals for a discovery campaign based on selected ICPs.
import { corsHeaders } from "../_shared/cors.ts";
import { requireUser, serviceClient, assertProjectAccess } from "../_shared/auth.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

interface Body { project_id: string; icp_ids: string[] }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    let user;
    try { ({ user } = await requireUser(req, corsHeaders)); }
    catch (r) { return r as Response; }

    const { project_id, icp_ids }: Body = await req.json();
    if (!project_id || !Array.isArray(icp_ids) || icp_ids.length === 0) {
      return json({ error: "project_id and non-empty icp_ids required" }, 400);
    }

    const sb = serviceClient();
    try { await assertProjectAccess(sb, user.id, project_id); }
    catch (e: any) { return json({ error: e?.message || "Forbidden" }, 403); }

    const { data: icps, error } = await sb.from("icps")
      .select("id, segment_name, firmographics, psychographics, buyer_roles, matrix_category")
      .eq("project_id", project_id)
      .in("id", icp_ids);
    if (error) return json({ error: error.message }, 500);
    if (!icps || icps.length === 0) return json({ signals: [], rationale: "No ICPs found" });

    // Also pull personas tied to these ICPs for richer signal grounding
    const { data: personas } = await sb.from("personas")
      .select("persona_name, role_in_buying, goals, pain_points, icp_id")
      .in("icp_id", icp_ids);

    const systemPrompt = `You generate B2B QUALIFYING SIGNALS for an outbound discovery campaign.

A qualifying signal is an OBSERVABLE, FALSIFIABLE indicator that an organisation is likely a good fit for the ICP and is in-market or in-trigger right now.

Best-practice sources to draw signals from:
- Firmographic fit: industry codes, employee band, revenue band, geography, ownership/structure (e.g. "ASX-listed", "APRA-regulated entity", "B-Corp certified").
- Regulatory / compliance posture: "ISO 27001 certified", "SOC 2 Type II", "GDPR-bound EU operations".
- Hiring signals (last 30-90 days): "Hiring Head of AI", "Hiring 3+ data engineers", "Opening first APAC sales role".
- Funding / financial: "Series B+ in last 18 months", "Recent PE acquisition", "Announced IPO".
- Tech-stack / infra: "Uses Salesforce + Marketo", "Migrated to Snowflake", "Public Github with Terraform modules".
- Leadership change: "New CTO appointed in last 6 months".
- Product / partnership / launch: "Launched API platform", "Partnership with hyperscaler".
- Demand / intent: "Speaking at <industry> summit", "Published RFP", "Authored thought-leadership on <topic>".
- Pain-point evidence aligned to persona pains.

HARD RULES:
- 6-10 signals, each a short noun phrase (max ~10 words).
- Every signal must be checkable from public sources (LinkedIn, news, filings, job boards, company site, Github).
- No vague adjectives ("innovative", "growing", "modern"). No solution-pitching.
- Tailor to the provided ICP firmographics/psychographics and persona pains - do not produce generic signals.
- Dedupe. Prefer specific over abstract.

Return ONLY JSON: {"signals": string[], "rationale": string}.`;

    const ai = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify({ icps, personas: personas || [] }) },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (ai.status === 429) return json({ error: "Rate limited. Try again shortly." }, 429);
    if (ai.status === 402) return json({ error: "AI credits exhausted. Add credits in workspace settings." }, 402);
    if (!ai.ok) {
      const txt = await ai.text();
      console.error("AI failed", ai.status, txt.slice(0, 400));
      return json({ error: `AI failed: ${ai.status}` }, 502);
    }

    const data = await ai.json();
    let parsed: any = {};
    try { parsed = JSON.parse(data?.choices?.[0]?.message?.content); } catch { /* ignore */ }
    const signals = Array.isArray(parsed.signals)
      ? Array.from(new Set(parsed.signals.filter((s: any) => typeof s === "string" && s.trim()).map((s: string) => s.trim()))).slice(0, 12)
      : [];
    return json({ signals, rationale: parsed.rationale || "" });
  } catch (e: any) {
    console.error(e);
    return json({ error: e?.message || "Internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
