// Two modes:
//  - mode "dimensions": propose the comparison dimensions that matter to this project's buyers.
//  - mode "whitespace": read the grid + profiles and return gaps, commoditised claims
//    and counter-positioning angles.
import { corsHeaders } from "../_shared/cors.ts";
import { requireUser, serviceClient, assertProjectAccess } from "../_shared/auth.ts";
import { aiJson, loadProjectContext, AiError } from "../_shared/competitorAi.ts";

interface Body { project_id: string; mode?: "dimensions" | "whitespace" }

const DIMENSIONS_SYSTEM = `You choose the dimensions a B2B buyer actually compares vendors on.

Return ONLY JSON: {"dimensions":[{"label":string,"description":string}]}

RULES:
- 6 to 8 dimensions, drawn from the buyer's decision criteria implied by the ICPs, personas, pain points and problems worth solving in the context.
- "label" is max 4 words, buyer language, never vendor jargon (good: "Speed to first result"; bad: "Solution scalability paradigm").
- "description" is one sentence explaining what "strong" looks like on this dimension.
- Cover a mix: outcome, evidence/credibility, ease of adoption, cost/commercial model, depth of expertise, risk/compliance where relevant.
- No duplicates and no dimension that only this business could ever win by definition.`;

const WHITESPACE_SYSTEM = `You find competitive whitespace for a B2B go-to-market team.

Return ONLY JSON:
{"items":[{"kind":"unowned"|"commoditised"|"counter_position","title":string,"rationale":string,"evidence":string[]}]}

RULES:
- Base every item ONLY on the supplied competitor profiles, comparison grid and project context. Never use outside knowledge about the named companies.
- "unowned": a dimension where no competitor is rated strong or credibly claims it. Name the dimension in the title.
- "commoditised": a claim that nearly every competitor makes, so it is worthless as differentiation. Quote the shared claim in the title.
- "counter_position": an angle this business can take that competitors structurally cannot or will not copy. Return 2 or 3 of these, each phrased as a positioning statement of max 20 words.
- "rationale" is 2 sentences max, and must reference the specific competitors or ratings that support it.
- "evidence" lists the competitor names (and dimension labels) the item is drawn from. Never a source you were not given.
- Return between 5 and 9 items in total. If the input is too thin for an item, leave it out rather than guessing.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    let user;
    try { ({ user } = await requireUser(req, corsHeaders)); }
    catch (r) { return r as Response; }

    const { project_id, mode = "whitespace" }: Body = await req.json();
    if (!project_id) return json({ error: "project_id required" }, 400);

    const sb = serviceClient();
    try { await assertProjectAccess(sb, user.id, project_id); }
    catch (e: any) { return json({ error: e?.message || "Forbidden" }, 403); }

    try {
      if (mode === "dimensions") {
        const context = await loadProjectContext(sb, project_id);
        const parsed = await aiJson(DIMENSIONS_SYSTEM, context);
        const list: any[] = Array.isArray(parsed.dimensions) ? parsed.dimensions.slice(0, 8) : [];
        if (list.length === 0) return json({ error: "The AI could not suggest dimensions from the current project data." }, 422);
        const { count } = await sb.from("competitor_dimensions")
          .select("id", { count: "exact", head: true }).eq("project_id", project_id);
        const start = count || 0;
        const rows = list
          .filter((d) => typeof d?.label === "string" && d.label.trim())
          .map((d, i) => ({
            project_id,
            label: d.label.trim().slice(0, 80),
            description: typeof d.description === "string" ? d.description.slice(0, 300) : null,
            position: start + i,
          }));
        const { data: ins, error } = await sb.from("competitor_dimensions").insert(rows).select("*");
        if (error) throw new Error(error.message);
        return json({ dimensions: ins || [] });
      }

      // whitespace
      const [compRes, dimRes, scoreRes] = await Promise.all([
        sb.from("competitors").select("id, name, type, positioning, claims, proof_points, strengths, weaknesses, target_segments, pricing_signals")
          .eq("project_id", project_id).eq("status", "confirmed"),
        sb.from("competitor_dimensions").select("id, label, description, position").eq("project_id", project_id).order("position"),
        sb.from("competitor_scores").select("dimension_id, competitor_id, claim, rating").eq("project_id", project_id),
      ]);
      const competitors = compRes.data || [];
      if (competitors.length === 0) {
        return json({ error: "Confirm at least one competitor before looking for gaps." }, 422);
      }
      const dims = dimRes.data || [];
      const nameById = new Map(competitors.map((c: any) => [c.id, c.name]));
      const grid = dims.map((d: any) => ({
        dimension: d.label,
        description: d.description,
        cells: (scoreRes.data || [])
          .filter((s: any) => s.dimension_id === d.id)
          .map((s: any) => ({
            who: s.competitor_id ? (nameById.get(s.competitor_id) || "Unknown") : "US",
            claim: s.claim,
            rating: s.rating,
          })),
      }));

      const context = await loadProjectContext(sb, project_id);
      const parsed = await aiJson(WHITESPACE_SYSTEM, { project_context: context, competitors, comparison_grid: grid });
      const items: any[] = Array.isArray(parsed.items) ? parsed.items.slice(0, 12) : [];
      if (items.length === 0) return json({ error: "The AI could not find clear gaps from the current data." }, 422);

      // Replace the previous analysis for this project.
      await sb.from("competitive_whitespace").delete().eq("project_id", project_id);
      const rows = items
        .filter((i) => typeof i?.title === "string" && i.title.trim())
        .map((i) => ({
          project_id,
          kind: ["unowned", "commoditised", "counter_position"].includes(i.kind) ? i.kind : "unowned",
          title: i.title.trim().slice(0, 300),
          rationale: typeof i.rationale === "string" ? i.rationale.slice(0, 800) : null,
          evidence: Array.isArray(i.evidence) ? i.evidence.filter((e: any) => typeof e === "string").slice(0, 8) : [],
        }));
      const { data: ins, error } = await sb.from("competitive_whitespace").insert(rows).select("*");
      if (error) throw new Error(error.message);
      return json({ items: ins || [] });
    } catch (e: any) {
      if (e instanceof AiError) return json({ error: e.message }, e.status === 429 ? 429 : 400);
      throw e;
    }
  } catch (e: any) {
    console.error(e);
    return json({ error: e?.message || "Internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
