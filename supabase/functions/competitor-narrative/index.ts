// Write a board-ready competitive landscape narrative from the data already gathered.
// Runs as a background job (competitor_runs, kind "narrative") with UI polling.
import { corsHeaders } from "../_shared/cors.ts";
import { requireUser, serviceClient, assertProjectAccess } from "../_shared/auth.ts";
import { loadProjectContext, AiError } from "../_shared/competitorAi.ts";

const MODEL = "openai/gpt-6-astra";

interface Body { project_id: string; persona_id?: string | null }

const SECTION_SPEC = [
  ["executive_summary", "Executive summary"],
  ["the_field", "The field"],
  ["how_buyers_compare_us", "How buyers compare us"],
  ["where_we_sit", "Where we sit"],
  ["whitespace", "Whitespace and counter-positioning"],
  ["risks", "Risks and watch list"],
  ["recommended_moves", "Recommended moves — next 90 days"],
] as const;

const SYSTEM = `You write the competitive landscape chapter of a board pack for a B2B go-to-market team.

Return ONLY JSON in this shape:
{"sections":[{"key":string,"heading":string,"paragraphs":string[],"bullets":string[]}]}

Return exactly these sections, in this order, using these keys and headings:
${SECTION_SPEC.map(([k, h]) => `- "${k}" / "${h}"`).join("\n")}

RULES:
- Base every statement ONLY on the supplied data: competitor research, the comparison grid, the market-position assessment, the whitespace analysis, the ICPs, personas, problems worth solving and value propositions. Never use outside knowledge about the named organisations, and never invent numbers, clients or dates.
- Write in plain British English for an intelligent non-specialist board member. Full sentences, no jargon, no markdown syntax inside the strings.
- Name organisations explicitly, and say what the evidence for each claim is.
- "paragraphs": 1-3 paragraphs of 40-90 words each. "bullets": 0-6 short lines (max 22 words each). Use bullets where a list reads better than prose, otherwise return an empty array.
- "the_field": group the organisations by archetype and say what each group competes on.
- "how_buyers_compare_us": walk the dimensions that matter most to the buyer, saying who is strong and where we stand.
- "where_we_sit": use the market-position scores — the across axis is evidenced market traction, the up axis is differentiation — and name the quadrant each significant organisation falls in (Leaders: high traction and high differentiation; Challengers: high traction, low differentiation; Visionaries: low traction, high differentiation; Niche players: low on both). Be honest when our own traction is thin.
- "risks": name what could go wrong competitively, and what to watch.
- "recommended_moves": 4-6 concrete, sequenced actions in bullets, each tied to a gap or a position named earlier.
- If the supplied data is too thin for a section, say so plainly in one short paragraph instead of guessing.
- Where a persona lens is supplied, write the whole narrative through that persona's eyes.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    let user;
    try { ({ user } = await requireUser(req, corsHeaders)); }
    catch (r) { return r as Response; }

    const { project_id, persona_id = null }: Body = await req.json();
    if (!project_id) return json({ error: "project_id required" }, 400);

    const sb = serviceClient();
    try { await assertProjectAccess(sb, user.id, project_id); }
    catch (e: any) { return json({ error: e?.message || "Forbidden" }, 403); }

    const [compRes, dimRes, scoreRes, posRes, wsRes] = await Promise.all([
      sb.from("competitors")
        .select("id, name, domain, type, archetype, positioning, claims, proof_points, strengths, weaknesses, target_segments, pricing_signals, why_suggested, source")
        .eq("project_id", project_id).eq("status", "confirmed"),
      sb.from("competitor_dimensions").select("id, label, description, importance")
        .eq("project_id", project_id).order("position"),
      sb.from("competitor_scores").select("dimension_id, competitor_id, claim, rating").eq("project_id", project_id),
      sb.from("competitor_market_positions")
        .select("competitor_id, persona_id, leadership, differentiation, rationale, cited_dimension_ids")
        .eq("project_id", project_id),
      sb.from("competitive_whitespace").select("kind, title, rationale, evidence").eq("project_id", project_id),
    ]);

    const comps = compRes.data || [];
    if (comps.length === 0) return json({ error: "Confirm at least one competitor first." }, 422);
    const dims = dimRes.data || [];

    let lensPersona: any = null;
    if (persona_id) {
      const { data: p } = await sb.from("personas")
        .select("persona_name, role_in_buying, goals, pain_points, buying_behaviour, channel_preferences, how_we_help")
        .eq("project_id", project_id).eq("id", persona_id).maybeSingle();
      lensPersona = p || null;
    }

    const { data: run, error: runErr } = await sb.from("competitor_runs")
      .insert({ project_id, kind: "narrative", status: "running", created_by: user.id })
      .select("id").single();
    if (runErr || !run) return json({ error: runErr?.message || "Could not start the narrative" }, 500);
    const runId = run.id as string;

    const background = (async () => {
      try {
        const context = await loadProjectContext(sb, project_id);
        const nameById = new Map<string, string>(comps.map((c: any) => [c.id, c.name]));
        const dimLabelById = new Map<string, string>(dims.map((d: any) => [d.id, d.label]));
        const ourName = context.project_name || "Us";

        const grid = dims.map((d: any) => ({
          dimension: d.label,
          description: d.description,
          importance: d.importance,
          cells: (scoreRes.data || [])
            .filter((s: any) => s.dimension_id === d.id)
            .map((s: any) => ({
              who: s.competitor_id ? (nameById.get(s.competitor_id) || "Unknown") : ourName,
              claim: s.claim,
              rating: s.rating,
            })),
        }));

        const allPositions = posRes.data || [];
        const chosen = allPositions.filter((p: any) => (p.persona_id ?? null) === (persona_id || null));
        const usable = chosen.length > 0 ? chosen : allPositions.filter((p: any) => p.persona_id === null);
        const positions = usable.map((p: any) => ({
          organisation: p.competitor_id ? (nameById.get(p.competitor_id) || "Unknown") : ourName,
          market_traction: p.leadership,
          differentiation: p.differentiation,
          rationale: p.rationale,
          cited_dimensions: (p.cited_dimension_ids || []).map((id: string) => dimLabelById.get(id)).filter(Boolean),
        }));

        const payload = {
          our_organisation: ourName,
          project_context: {
            project_name: context.project_name,
            website: context.website,
            brand_context: context.brand_context,
            icps: context.icps,
            personas: context.personas,
            value_propositions: context.value_propositions,
            problems_worth_solving: context.problems_worth_solving,
          },
          persona_lens: lensPersona,
          competitors: comps.map((c: any) => ({
            name: c.name, domain: c.domain, type: c.type, archetype: c.archetype,
            positioning: c.positioning, claims: c.claims, proof_points: c.proof_points,
            strengths: c.strengths, weaknesses: c.weaknesses, target_segments: c.target_segments,
            pricing_signals: c.pricing_signals, why_they_matter: c.why_suggested, found_via: c.source,
          })),
          dimensions: dims.map((d: any) => ({ label: d.label, description: d.description, importance: d.importance })),
          comparison_grid: grid,
          market_positions: positions,
          whitespace: wsRes.data || [],
        };

        const parsed = await aiStreamJson(SYSTEM, payload);
        const raw: any[] = Array.isArray(parsed?.sections) ? parsed.sections : [];
        const byKey = new Map(raw.map((s: any) => [String(s?.key || "").trim(), s]));

        const sections = SECTION_SPEC.map(([key, heading]) => {
          const s: any = byKey.get(key) || {};
          return {
            key,
            heading: typeof s.heading === "string" && s.heading.trim() ? s.heading.trim().slice(0, 120) : heading,
            paragraphs: (Array.isArray(s.paragraphs) ? s.paragraphs : [])
              .filter((p: any) => typeof p === "string" && p.trim())
              .map((p: string) => p.trim().slice(0, 1600)).slice(0, 4),
            bullets: (Array.isArray(s.bullets) ? s.bullets : [])
              .filter((b: any) => typeof b === "string" && b.trim())
              .map((b: string) => b.trim().slice(0, 300)).slice(0, 8),
          };
        }).filter((s) => s.paragraphs.length > 0 || s.bullets.length > 0);

        if (sections.length === 0) throw new Error("The AI returned no usable narrative.");

        const markdown = sections.map((s) =>
          `## ${s.heading}\n\n${s.paragraphs.join("\n\n")}${s.bullets.length ? "\n\n" + s.bullets.map((b) => `- ${b}`).join("\n") : ""}`,
        ).join("\n\n");

        const row = {
          project_id,
          persona_id: persona_id || null,
          sections,
          markdown,
          model: MODEL,
          generated_at: new Date().toISOString(),
        };
        const { data: existing } = await sb.from("competitive_narratives")
          .select("id, persona_id").eq("project_id", project_id);
        const hit = (existing || []).find((e: any) => (e.persona_id ?? null) === (persona_id || null));
        if (hit) await sb.from("competitive_narratives").update(row).eq("id", hit.id);
        else await sb.from("competitive_narratives").insert(row);

        await sb.from("competitor_runs").update({
          status: "complete", saved_count: sections.length,
          result: { sections: sections.length, persona_id: persona_id || null },
        }).eq("id", runId);
      } catch (e: any) {
        console.error("[competitor-narrative] failed", e?.message);
        await sb.from("competitor_runs").update({
          status: "error",
          error: e instanceof AiError ? e.message : (e?.message || "The narrative could not be written."),
        }).eq("id", runId);
      }
    })();

    const rt = (globalThis as any).EdgeRuntime;
    if (rt?.waitUntil) rt.waitUntil(background);
    return json({ run_id: runId, status: "running" }, 202);
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e?.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/** Streamed chat completion that returns parsed JSON — long runs must stream. */
async function aiStreamJson(system: string, payload: unknown): Promise<any> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new AiError(500, "LOVABLE_API_KEY is not configured.");

  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      reasoning_effort: "low",
      stream: true,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Return the narrative as JSON.\n\n${typeof payload === "string" ? payload : JSON.stringify(payload)}` },
      ],
    }),
  });

  if (!r.ok || !r.body) {
    const text = await r.text().catch(() => "");
    console.error("[competitor-narrative] gateway error", r.status, text.slice(0, 400));
    if (r.status === 402) throw new AiError(402, "AI credits exhausted — top up credits in Lovable to continue.");
    if (r.status === 403) throw new AiError(403, "AI access is blocked by workspace settings. Ask an admin to re-enable Lovable AI.");
    if (r.status === 429) throw new AiError(429, "AI is rate limited right now. Try again in a minute.");
    throw new AiError(r.status, `AI request failed (${r.status}).`);
  }

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const d = JSON.parse(data);
        const delta = d?.choices?.[0]?.delta?.content;
        if (typeof delta === "string") content += delta;
      } catch { /* partial frame */ }
    }
  }

  try {
    return JSON.parse(content);
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(content.slice(start, end + 1)); } catch { /* fall through */ }
    }
    console.error("[competitor-narrative] unparseable content", content.slice(0, 300));
    throw new AiError(502, "The AI response could not be read. Try again.");
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
