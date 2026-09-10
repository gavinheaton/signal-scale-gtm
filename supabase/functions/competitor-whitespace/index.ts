// Three modes:
//  - mode "dimensions": propose the comparison dimensions that matter to this project's buyers.
//  - mode "map_grid": fill the comparison grid (claims + ratings) from the research already stored
//    on each confirmed competitor. Runs as a background job, saving batch by batch.
//  - mode "whitespace": read the grid + profiles and return gaps, commoditised claims
//    and counter-positioning angles.
import { corsHeaders } from "../_shared/cors.ts";
import { requireUser, serviceClient, assertProjectAccess } from "../_shared/auth.ts";
import { aiJson, loadProjectContext, AiError } from "../_shared/competitorAi.ts";

interface Body {
  project_id: string;
  mode?: "dimensions" | "whitespace" | "map_grid" | "market_position";
  overwrite?: boolean;
  persona_id?: string | null;
}

const MARKET_SYSTEM = `You place organisations on a market-position map, in the style of an analyst quadrant.

Return ONLY JSON:
{"positions":[{"organisation":string,"leadership":number,"differentiation":number,"rationale":string,"cited_dimensions":string[]}]}

RULES:
- "organisation" must exactly match a supplied organisation name (the business itself is supplied as "US").
- "leadership" 0-100: presence, credibility, reach and pull with the buyers described in the supplied personas and ICPs. 100 = the name every buyer in this segment already knows and shortlists.
- "differentiation" 0-100: how distinct their position is from the rest of the supplied field. 100 = stands for something nobody else stands for. A large generalist that looks like its peers scores low here even with high leadership.
- Judge ONLY from the supplied research, comparison grid, personas and project context. Never use outside knowledge about the named organisations.
- Spread the scores. Use the full range, avoid clustering everything near 50, and do not give two organisations the same pair of scores.
- "rationale" is ONE sentence, max 25 words, explaining the placement.
- "cited_dimensions" lists 1-3 supplied dimension labels (exact matches) that the placement rests on.
- Return one entry for every organisation supplied, including "US".
- When a single persona is supplied as the lens, weigh that persona's priorities and buying behaviour above everything else.`;


const MAP_SYSTEM = `You fill a competitive comparison grid from research that has already been gathered.

Return ONLY JSON:
{"cells":[{"organisation":string,"dimension":string,"claim":string,"rating":"strong"|"parity"|"weak"|null}]}

RULES:
- Use ONLY the supplied research (positioning, claims, proof points, strengths, weaknesses, segments, pricing signals) and the project context. Never use outside knowledge about the named organisations.
- "organisation" must exactly match a supplied organisation name; "dimension" must exactly match a supplied dimension label.
- Return one cell per organisation per dimension. Cover every combination supplied.
- "claim" is max 14 words, in the organisation's own language, describing what they offer on that dimension. If the research says nothing about it, return an empty string.
- "rating": "strong" only when the research clearly evidences leadership on that dimension (a proof point, a named capability, a stated focus). "parity" when they do it but nothing sets them apart. "weak" when the research shows a gap or a stated weakness. null when the research says nothing at all — do not guess.
- Be discriminating: most organisations should NOT be strong on most dimensions.
- For the organisation named "US" use the project's own value proposition, problems worth solving and proof points.`;


const DIMENSIONS_SYSTEM = `You choose the dimensions a B2B buyer actually compares vendors on.

Return ONLY JSON: {"dimensions":[{"label":string,"description":string,"importance":1|2|3|4|5}]}

RULES:
- 6 to 8 dimensions, drawn from the buyer's decision criteria implied by the ICPs, personas, pain points and problems worth solving in the context.
- "label" is max 4 words, buyer language, never vendor jargon (good: "Speed to first result"; bad: "Solution scalability paradigm").
- "description" is one sentence explaining what "strong" looks like on this dimension.
- "importance" is how much this dimension weighs on the buyer's decision: 5 = a deal-breaker, 3 = considered, 1 = nice to have. Vary the values; do not give everything a 5.
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

    const { project_id, mode = "whitespace", overwrite = false, persona_id = null }: Body = await req.json();
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
            importance: Math.min(5, Math.max(1, Math.round(Number(d.importance) || 3))),
            position: start + i,
          }));
        const { data: ins, error } = await sb.from("competitor_dimensions").insert(rows).select("*");
        if (error) throw new Error(error.message);
        return json({ dimensions: ins || [] });
      }

      if (mode === "map_grid") {
        const [compRes, dimRes] = await Promise.all([
          sb.from("competitors")
            .select("id, name, type, archetype, positioning, claims, proof_points, strengths, weaknesses, target_segments, pricing_signals")
            .eq("project_id", project_id).eq("status", "confirmed"),
          sb.from("competitor_dimensions").select("id, label, description, importance")
            .eq("project_id", project_id).order("position"),
        ]);
        const comps = compRes.data || [];
        const dims = dimRes.data || [];
        if (comps.length === 0) return json({ error: "Confirm at least one competitor first." }, 422);
        if (dims.length === 0) return json({ error: "Add or suggest some dimensions first." }, 422);

        const { data: run, error: runErr } = await sb.from("competitor_runs")
          .insert({ project_id, kind: "map_grid", status: "running", created_by: user.id })
          .select("id").single();
        if (runErr || !run) return json({ error: runErr?.message || "Could not start mapping" }, 500);
        const runId = run.id as string;

        const background = (async () => {
          let filled = 0;
          try {
            const context = await loadProjectContext(sb, project_id);
            const { data: existingScores } = await sb.from("competitor_scores")
              .select("id, dimension_id, competitor_id, claim, rating").eq("project_id", project_id);
            const existing = existingScores || [];
            const keyOf = (dimId: string, compId: string | null) => `${dimId}|${compId ?? "us"}`;
            const byKey = new Map(existing.map((s: any) => [keyOf(s.dimension_id, s.competitor_id ?? null), s]));
            const dimByLabel = new Map(dims.map((d: any) => [d.label.toLowerCase(), d]));

            const targets: { id: string | null; name: string; research: any }[] = [
              {
                id: null,
                name: "US",
                research: {
                  positioning: context.value_propositions?.[0]?.statement || null,
                  value_propositions: context.value_propositions,
                  problems_worth_solving: context.problems_worth_solving,
                  personas: context.personas,
                  brand_context: context.brand_context,
                },
              },
              ...comps.map((c: any) => ({
                id: c.id,
                name: c.name,
                research: {
                  type: c.type, archetype: c.archetype, positioning: c.positioning,
                  claims: c.claims, proof_points: c.proof_points, strengths: c.strengths,
                  weaknesses: c.weaknesses, target_segments: c.target_segments,
                  pricing_signals: c.pricing_signals,
                },
              })),
            ];

            const BATCH = 3;
            for (let i = 0; i < targets.length; i += BATCH) {
              const batch = targets.slice(i, i + BATCH);
              const nameToId = new Map(batch.map((t) => [t.name.toLowerCase(), t.id]));
              let parsed: any = {};
              try {
                parsed = await aiJson(MAP_SYSTEM, {
                  project_context: {
                    project_name: context.project_name,
                    icps: context.icps,
                    personas: context.personas,
                    value_propositions: context.value_propositions,
                    problems_worth_solving: context.problems_worth_solving,
                  },
                  dimensions: dims.map((d: any) => ({ label: d.label, description: d.description, importance: d.importance })),
                  organisations: batch.map((t) => ({ name: t.name, research: t.research })),
                });
              } catch (e: any) {
                if (e instanceof AiError && e.status === 429) {
                  await new Promise((r) => setTimeout(r, 4000));
                  continue;
                }
                throw e;
              }

              const cells: any[] = Array.isArray(parsed.cells) ? parsed.cells : [];
              const inserts: any[] = [];
              for (const cell of cells) {
                const orgName = typeof cell?.organisation === "string" ? cell.organisation.trim().toLowerCase() : "";
                const dim = dimByLabel.get(
                  typeof cell?.dimension === "string" ? cell.dimension.trim().toLowerCase() : "",
                );
                if (!dim || !nameToId.has(orgName)) continue;
                const compId = nameToId.get(orgName) ?? null;
                const rating = ["strong", "parity", "weak"].includes(cell?.rating) ? cell.rating : null;
                const claim = typeof cell?.claim === "string" && cell.claim.trim()
                  ? cell.claim.trim().slice(0, 200) : null;
                if (!rating && !claim) continue;

                const prev: any = byKey.get(keyOf(dim.id, compId));
                if (prev) {
                  const hasContent = (prev.claim && String(prev.claim).trim()) || prev.rating;
                  if (hasContent && !overwrite) continue;
                  await sb.from("competitor_scores").update({ claim, rating }).eq("id", prev.id);
                  filled += 1;
                } else {
                  inserts.push({ project_id, dimension_id: dim.id, competitor_id: compId, claim, rating });
                  byKey.set(keyOf(dim.id, compId), { id: "pending", claim, rating });
                }
              }
              if (inserts.length > 0) {
                const { error: insErr } = await sb.from("competitor_scores").insert(inserts);
                if (insErr) console.error("[competitor-whitespace] map insert failed", insErr.message);
                else filled += inserts.length;
              }
              await sb.from("competitor_runs").update({ saved_count: filled }).eq("id", runId);
            }

            await sb.from("competitor_runs").update({
              status: "complete",
              saved_count: filled,
              result: { cells_filled: filled, organisations: targets.length, dimensions: dims.length },
            }).eq("id", runId);
          } catch (e: any) {
            console.error("[competitor-whitespace] map_grid failed", e?.message);
            await sb.from("competitor_runs").update({
              status: "error",
              saved_count: filled,
              error: e instanceof AiError ? e.message : (e?.message || "Mapping failed"),
            }).eq("id", runId);
          }
        })();

        const rt = (globalThis as any).EdgeRuntime;
        if (rt?.waitUntil) rt.waitUntil(background);
        return json({ run_id: runId, status: "running" }, 202);
      }

      if (mode === "market_position") {
        const [compRes, dimRes, scoreRes] = await Promise.all([
          sb.from("competitors")
            .select("id, name, type, archetype, positioning, claims, proof_points, strengths, weaknesses, target_segments, pricing_signals")
            .eq("project_id", project_id).eq("status", "confirmed"),
          sb.from("competitor_dimensions").select("id, label, description, importance")
            .eq("project_id", project_id).order("position"),
          sb.from("competitor_scores").select("dimension_id, competitor_id, claim, rating").eq("project_id", project_id),
        ]);
        const comps = compRes.data || [];
        const dims = dimRes.data || [];
        if (comps.length === 0) return json({ error: "Confirm at least one competitor first." }, 422);

        let lensPersona: any = null;
        if (persona_id) {
          const { data: p } = await sb.from("personas")
            .select("persona_name, role_in_buying, goals, pain_points, buying_behaviour, channel_preferences, how_we_help")
            .eq("project_id", project_id).eq("id", persona_id).maybeSingle();
          lensPersona = p || null;
        }

        const { data: run, error: runErr } = await sb.from("competitor_runs")
          .insert({ project_id, kind: "market_position", status: "running", created_by: user.id })
          .select("id").single();
        if (runErr || !run) return json({ error: runErr?.message || "Could not start the assessment" }, 500);
        const runId = run.id as string;

        const background = (async () => {
          let saved = 0;
          try {
            const context = await loadProjectContext(sb, project_id);
            const nameById = new Map(comps.map((c: any) => [c.id, c.name]));
            const grid = dims.map((d: any) => ({
              dimension: d.label,
              importance: d.importance,
              cells: (scoreRes.data || [])
                .filter((s: any) => s.dimension_id === d.id)
                .map((s: any) => ({
                  who: s.competitor_id ? (nameById.get(s.competitor_id) || "Unknown") : "US",
                  claim: s.claim,
                  rating: s.rating,
                })),
            }));
            const dimIdByLabel = new Map(dims.map((d: any) => [String(d.label).toLowerCase(), d.id]));

            const organisations = [
              {
                name: "US",
                research: {
                  positioning: context.value_propositions?.[0]?.statement || null,
                  value_propositions: context.value_propositions,
                  problems_worth_solving: context.problems_worth_solving,
                  brand_context: context.brand_context,
                },
              },
              ...comps.map((c: any) => ({
                name: c.name,
                research: {
                  type: c.type, archetype: c.archetype, positioning: c.positioning,
                  claims: c.claims, proof_points: c.proof_points, strengths: c.strengths,
                  weaknesses: c.weaknesses, target_segments: c.target_segments,
                  pricing_signals: c.pricing_signals,
                },
              })),
            ];
            const idByName = new Map<string, string | null>([["us", null]]);
            for (const c of comps as any[]) idByName.set(String(c.name).toLowerCase(), c.id);

            const parsed = await aiJson(MARKET_SYSTEM, {
              project_context: {
                project_name: context.project_name,
                icps: context.icps,
                value_propositions: context.value_propositions,
                problems_worth_solving: context.problems_worth_solving,
              },
              lens: lensPersona ? { persona: lensPersona } : { personas: context.personas },
              dimensions: dims.map((d: any) => ({ label: d.label, description: d.description, importance: d.importance })),
              comparison_grid: grid,
              organisations,
            });

            const list: any[] = Array.isArray(parsed.positions) ? parsed.positions : [];
            const clamp = (n: any) => Math.min(100, Math.max(0, Math.round(Number(n) || 0)));
            for (const p of list) {
              const key = typeof p?.organisation === "string" ? p.organisation.trim().toLowerCase() : "";
              if (!idByName.has(key)) continue;
              const competitor_id = idByName.get(key) ?? null;
              const cited = Array.isArray(p?.cited_dimensions)
                ? p.cited_dimensions
                    .map((l: any) => dimIdByLabel.get(String(l).trim().toLowerCase()))
                    .filter((x: any) => !!x).slice(0, 3)
                : [];
              const row = {
                project_id,
                competitor_id,
                persona_id: persona_id || null,
                leadership: clamp(p?.leadership),
                differentiation: clamp(p?.differentiation),
                rationale: typeof p?.rationale === "string" ? p.rationale.trim().slice(0, 300) : null,
                cited_dimension_ids: cited,
              };
              const { data: existing } = await sb.from("competitor_market_positions")
                .select("id, persona_id, competitor_id").eq("project_id", project_id);
              const hit = (existing || []).find((e: any) =>
                (e.competitor_id ?? null) === competitor_id && (e.persona_id ?? null) === (persona_id || null));
              if (hit) {
                await sb.from("competitor_market_positions").update(row).eq("id", hit.id);
              } else {
                await sb.from("competitor_market_positions").insert(row);
              }
              saved += 1;
              await sb.from("competitor_runs").update({ saved_count: saved }).eq("id", runId);
            }

            await sb.from("competitor_runs").update({
              status: "complete", saved_count: saved,
              result: { organisations: organisations.length, persona_id: persona_id || null },
            }).eq("id", runId);
          } catch (e: any) {
            console.error("[competitor-whitespace] market_position failed", e?.message);
            await sb.from("competitor_runs").update({
              status: "error", saved_count: saved,
              error: e instanceof AiError ? e.message : (e?.message || "Assessment failed"),
            }).eq("id", runId);
          }
        })();

        const rt2 = (globalThis as any).EdgeRuntime;
        if (rt2?.waitUntil) rt2.waitUntil(background);
        return json({ run_id: runId, status: "running" }, 202);
      }


      // whitespace
      const [compRes, dimRes, scoreRes] = await Promise.all([
        sb.from("competitors").select("id, name, type, positioning, claims, proof_points, strengths, weaknesses, target_segments, pricing_signals")
          .eq("project_id", project_id).eq("status", "confirmed"),
        sb.from("competitor_dimensions").select("id, label, description, position, importance").eq("project_id", project_id).order("position"),
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
        importance: d.importance,
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
