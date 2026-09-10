// Suggest ecosystem stakeholders (funders, infrastructure owners, research bodies,
// regulators, community bodies) that are missing from the map, with the roles they
// hold and the relationships they have. Suggestions land in
// ecosystem_stakeholder_suggestions for human review.
import { corsHeaders } from "../_shared/cors.ts";
import { requireUser, serviceClient, assertProjectAccess } from "../_shared/auth.ts";
import { aiJson, AiError } from "../_shared/competitorAi.ts";

interface Body { map_id: string }

const ROLE_VALUES = [
  "client", "funder", "infrastructure_owner", "research_body", "regulator",
  "partner", "supplier", "channel", "community", "influencer", "competitor", "media",
];
const EDGE_VALUES = [
  "serves", "buys_from", "partners_with", "funds", "owns_infrastructure", "supplies",
  "collaborates_with", "advocates_for", "regulates", "influences", "competes_with",
  "belongs_to", "evidences", "custom",
];
const NODE_KINDS = [
  "stakeholder", "funder", "infrastructure_owner", "research_body", "partner",
  "regulator", "competitor", "channel", "influencer", "community", "company", "custom",
];

const SYSTEM = `You map the wider ecosystem around a B2B go-to-market strategy.
Identify ORGANISATIONS (never individuals) that shape the market but are missing from the current map:
infrastructure owners, funders and investors, applied research bodies, regulators and policy makers,
industry associations and community alliances, delivery partners, standards bodies, major channel players.

Rules:
- Real, named, verifiable organisations relevant to the project's geography and segments. No invented names.
- Prefer organisations relevant to the segments and competitors provided.
- Many organisations hold SEVERAL roles at once (e.g. a utility can be a client, an infrastructure owner
  and a co-funder of research). Always list every role that applies.
- Do not repeat organisations already on the map (list provided).
- 8 to 14 suggestions, highest strategic relevance first.

Return strict JSON:
{"stakeholders":[{"name":"","subtitle":"one line on who they are","node_kind":"one of ${NODE_KINDS.join("|")}",
"roles":["subset of ${ROLE_VALUES.join("|")}"],
"relationships":[{"target":"project | the exact label of a listed segment, competitor or map node","kind":"one of ${EDGE_VALUES.join("|")}","note":"short reason"}],
"rationale":"why they matter to this strategy","evidence":["url or source name"]}]}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { user } = await requireUser(req, corsHeaders);
    const { map_id } = (await req.json()) as Body;
    if (!map_id) throw new Error("map_id required");
    const svc = serviceClient();

    const { data: map } = await svc
      .from("ecosystem_maps").select("id, project_id").eq("id", map_id).maybeSingle();
    if (!map) throw new Error("Map not found");
    const projectId = map.project_id as string;
    await assertProjectAccess(svc, user.id, projectId);

    const [projRes, icpRes, perRes, compRes, wsRes, nodeRes] = await Promise.all([
      svc.from("projects").select("id, name, website, brand_context").eq("id", projectId).maybeSingle(),
      svc.from("icps").select("segment_name, firmographics, matrix_category").eq("project_id", projectId),
      svc.from("personas").select("persona_name, role_in_buying, how_we_help").eq("project_id", projectId),
      svc.from("competitors").select("name, archetype, positioning, source").eq("project_id", projectId).eq("status", "confirmed"),
      svc.from("competitive_whitespace").select("kind, title, rationale").eq("project_id", projectId),
      svc.from("ecosystem_nodes").select("id, label, kind, meta").eq("map_id", map_id).eq("hidden", false),
    ]);

    const nodes = (nodeRes.data || []) as any[];
    const existingLabels = nodes.map((n) => n.label);

    const payload = {
      project: {
        name: projRes.data?.name, website: projRes.data?.website,
        context: projRes.data?.brand_context ?? null,
      },
      segments: (icpRes.data || []).map((i: any) => ({
        label: i.segment_name, category: i.matrix_category, firmographics: i.firmographics,
      })),
      personas: perRes.data || [],
      known_players: (compRes.data || []).map((c: any) => ({
        label: c.name, archetype: c.archetype, positioning: c.positioning,
        relationship: c.source === "own_site" ? "linked partner" : "competitor",
      })),
      whitespace: wsRes.data || [],
      already_on_map: existingLabels,
    };

    const out = await aiJson(SYSTEM, payload);
    const raw = Array.isArray(out?.stakeholders) ? out.stakeholders : [];

    const lower = new Set(existingLabels.map((l) => String(l).toLowerCase().trim()));
    const { data: priorRows } = await svc
      .from("ecosystem_stakeholder_suggestions").select("name, status").eq("map_id", map_id);
    for (const p of (priorRows || []) as any[]) lower.add(String(p.name).toLowerCase().trim());

    const rows: any[] = [];
    for (const s of raw) {
      const name = String(s?.name || "").trim();
      if (!name || lower.has(name.toLowerCase())) continue;
      lower.add(name.toLowerCase());
      const roles = (Array.isArray(s.roles) ? s.roles : []).filter((r: any) => ROLE_VALUES.includes(r));
      const relationships = (Array.isArray(s.relationships) ? s.relationships : [])
        .map((r: any) => ({
          target: String(r?.target || "project"),
          kind: EDGE_VALUES.includes(r?.kind) ? r.kind : "influences",
          note: r?.note ? String(r.note).slice(0, 240) : null,
        }))
        .slice(0, 6);
      rows.push({
        project_id: projectId, map_id,
        name,
        subtitle: s.subtitle ? String(s.subtitle).slice(0, 200) : null,
        node_kind: NODE_KINDS.includes(s.node_kind) ? s.node_kind : "stakeholder",
        roles: roles.length ? roles : ["influencer"],
        relationships: relationships.length ? relationships : [{ target: "project", kind: "influences", note: null }],
        rationale: s.rationale ? String(s.rationale).slice(0, 1200) : null,
        evidence: Array.isArray(s.evidence) ? s.evidence.slice(0, 5).map((e: any) => String(e)) : [],
        status: "pending",
      });
    }

    if (rows.length) {
      const { error } = await svc.from("ecosystem_stakeholder_suggestions").insert(rows);
      if (error) throw new Error(`save suggestions: ${error.message}`);
    }

    return new Response(JSON.stringify({ ok: true, suggested: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    const status = e instanceof AiError ? e.status : 500;
    console.error("ecosystem-suggest-stakeholders error", e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
