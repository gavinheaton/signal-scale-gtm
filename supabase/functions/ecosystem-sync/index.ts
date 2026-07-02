// Ecosystem Map sync: rebuild synced nodes/edges from ICPs, Personas, and Discovery.
// Manual nodes/edges (ref_table IS NULL) are preserved. Synced nodes that disappear
// from source are marked hidden+stale.
import { corsHeaders } from "../_shared/cors.ts";
import { requireUser, serviceClient, assertProjectAccess } from "../_shared/auth.ts";

interface Body { map_id: string }

function readiness(node: any): number | null {
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { user } = await requireUser(req, corsHeaders);
    const { map_id } = (await req.json()) as Body;
    if (!map_id) throw new Error("map_id required");
    const svc = serviceClient();

    const { data: map, error: mapErr } = await svc
      .from("ecosystem_maps").select("id, project_id").eq("id", map_id).maybeSingle();
    if (mapErr || !map) throw new Error("Map not found");
    const projectId = map.project_id as string;
    await assertProjectAccess(svc, user.id, projectId);

    // Load source data
    const [projRes, icpsRes, personasRes, dcampRes] = await Promise.all([
      svc.from("projects").select("id, name, website_url").eq("id", projectId).maybeSingle(),
      svc.from("icps").select("id, segment_name, fit_score, access_score, matrix_category").eq("project_id", projectId),
      svc.from("personas").select("id, persona_name, icp_id, role_in_buying, ai_readiness_score").eq("project_id", projectId),
      svc.from("discovery_campaigns").select("id, icp_ids").eq("project_id", projectId),
    ]);
    const project = projRes.data;
    const icps = (icpsRes.data || []) as any[];
    const personas = (personasRes.data || []) as any[];
    const dcamps = (dcampRes.data || []) as any[];
    const dcampIds = dcamps.map((c) => c.id);

    // Orgs / roles / contacts / themes / insights across all discovery campaigns in this project
    let orgs: any[] = [], roles: any[] = [], contacts: any[] = [];
    let themes: any[] = [], insights: any[] = [], conversations: any[] = [];
    if (dcampIds.length) {
      const [oR, tR] = await Promise.all([
        svc.from("discovery_organizations").select("id, name, domain, segment, tier, campaign_id, leadership").in("campaign_id", dcampIds),
        svc.from("discovery_themes").select("id, campaign_id, label, description, status").in("campaign_id", dcampIds),
      ]);
      orgs = (oR.data || []) as any[];
      themes = (tR.data || []) as any[];
      const orgIds = orgs.map((o) => o.id);
      if (orgIds.length) {
        const [rR2, cR2] = await Promise.all([
          svc.from("discovery_org_roles").select("id, organization_id, persona_id, role_title").in("organization_id", orgIds),
          svc.from("discovery_contacts").select("id, name, title, email, linkedin_url, organization_id, persona_id, outreach_status").in("organization_id", orgIds),
        ]);
        roles = (rR2.data || []) as any[];
        contacts = (cR2.data || []) as any[];
      }
      const contactIds = contacts.map((c) => c.id);
      if (contactIds.length) {
        const cvR = await svc.from("discovery_conversations").select("id, contact_id").in("contact_id", contactIds);
        conversations = (cvR.data || []) as any[];
      }
      const iR = await svc.from("discovery_insights").select("id, conversation_id, campaign_id, text, kind, is_quote, theme_id").in("campaign_id", dcampIds);
      insights = (iR.data || []) as any[];
    }

    // Load existing synced nodes
    const { data: existingNodes } = await svc
      .from("ecosystem_nodes").select("id, ref_table, ref_id").eq("map_id", map_id).not("ref_table", "is", null);
    const existingKey = new Map<string, string>();
    for (const n of (existingNodes || []) as any[]) {
      existingKey.set(`${n.ref_table}:${n.ref_id}`, n.id);
    }
    const touched = new Set<string>();

    // Layout constants — concentric hexagonal rings
    const cx = 0, cy = 0;
    const R = { 0: 0, 1: 320, 2: 640, 3: 960, 4: 1240 };
    function ringPos(ring: number, idx: number, total: number): { x: number; y: number } {
      if (ring === 0) return { x: cx, y: cy };
      const angle = (2 * Math.PI * idx) / Math.max(total, 1) - Math.PI / 2;
      const r = R[ring as keyof typeof R] || 320 * ring;
      return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
    }

    async function upsertNode(input: {
      kind: string; ref_table: string; ref_id: string; label: string; subtitle?: string;
      ring: number; idx: number; total: number; readiness_score?: number | null; meta?: any;
    }): Promise<string> {
      const key = `${input.ref_table}:${input.ref_id}`;
      touched.add(key);
      const pos = ringPos(input.ring, input.idx, input.total);
      const existingId = existingKey.get(key);
      if (existingId) {
        await svc.from("ecosystem_nodes").update({
          label: input.label, subtitle: input.subtitle ?? null,
          ring: input.ring, readiness_score: input.readiness_score ?? null,
          hidden: false, stale: false, meta: input.meta ?? {},
        }).eq("id", existingId);
        return existingId;
      }
      const { data, error } = await svc.from("ecosystem_nodes").insert({
        map_id, project_id: projectId, kind: input.kind,
        ref_table: input.ref_table, ref_id: input.ref_id,
        label: input.label, subtitle: input.subtitle ?? null,
        x: pos.x, y: pos.y, ring: input.ring,
        readiness_score: input.readiness_score ?? null, meta: input.meta ?? {},
      }).select("id").single();
      if (error) throw new Error(`node insert: ${error.message}`);
      return data.id as string;
    }

    // 1. Project node (centre)
    const projectNodeId = await upsertNode({
      kind: "project", ref_table: "projects", ref_id: projectId,
      label: project?.name || "Your project", subtitle: project?.website_url || undefined,
      ring: 0, idx: 0, total: 1,
    });

    // 2. Segment nodes (ICPs) — ring 1
    const icpNodeId = new Map<string, string>();
    for (let i = 0; i < icps.length; i++) {
      const icp = icps[i];
      const score = Math.round(((icp.fit_score || 0) * 5 + (icp.access_score || 0) * 5)); // out of 100
      const id = await upsertNode({
        kind: "segment", ref_table: "icps", ref_id: icp.id,
        label: icp.segment_name || "Segment",
        subtitle: icp.matrix_category || undefined,
        ring: 1, idx: i, total: Math.max(icps.length, 1),
        readiness_score: Math.min(100, score),
        meta: { fit_score: icp.fit_score, access_score: icp.access_score, matrix_category: icp.matrix_category },
      });
      icpNodeId.set(icp.id, id);
    }

    // 3. Company nodes (discovery orgs) — ring 2
    const orgNodeId = new Map<string, string>();
    const campIcp = new Map<string, string[]>();
    for (const c of dcamps) campIcp.set(c.id, (c.icp_ids || []) as string[]);
    for (let i = 0; i < orgs.length; i++) {
      const o = orgs[i];
      const id = await upsertNode({
        kind: "company", ref_table: "discovery_organizations", ref_id: o.id,
        label: o.name, subtitle: o.domain || o.segment || undefined,
        ring: 2, idx: i, total: Math.max(orgs.length, 1),
        readiness_score: o.tier === "A" ? 80 : o.tier === "B" ? 55 : o.tier === "C" ? 30 : null,
        meta: { tier: o.tier, segment: o.segment, campaign_id: o.campaign_id },
      });
      orgNodeId.set(o.id, id);
    }

    // 4. Role nodes: personas + discovery_org_roles — ring 3
    const personaNodeId = new Map<string, string>();
    for (let i = 0; i < personas.length; i++) {
      const p = personas[i];
      const id = await upsertNode({
        kind: "role", ref_table: "personas", ref_id: p.id,
        label: p.persona_name, subtitle: p.role_in_buying || undefined,
        ring: 3, idx: i, total: Math.max(personas.length + roles.length, 1),
        readiness_score: p.ai_readiness_score ? p.ai_readiness_score * 20 : null,
        meta: { role_in_buying: p.role_in_buying, icp_id: p.icp_id },
      });
      personaNodeId.set(p.id, id);
    }
    const orgRoleNodeId = new Map<string, string>();
    for (let i = 0; i < roles.length; i++) {
      const r = roles[i];
      const id = await upsertNode({
        kind: "role", ref_table: "discovery_org_roles", ref_id: r.id,
        label: r.role_title, subtitle: undefined,
        ring: 3, idx: personas.length + i, total: Math.max(personas.length + roles.length, 1),
        meta: { organization_id: r.organization_id, persona_id: r.persona_id },
      });
      orgRoleNodeId.set(r.id, id);
    }

    // 5. Person nodes (discovery contacts + leadership) — ring 4
    const contactNodeId = new Map<string, string>();
    const totalPeople = contacts.length + orgs.reduce((s, o) => s + ((o.leadership || []).length), 0);
    let peopleIdx = 0;
    for (const ct of contacts) {
      const score = ct.outreach_status === "replied" ? 90
        : ct.outreach_status === "contacted" ? 60
        : ct.outreach_status === "queued" ? 40
        : ct.email || ct.linkedin_url ? 30 : 15;
      const id = await upsertNode({
        kind: "person", ref_table: "discovery_contacts", ref_id: ct.id,
        label: ct.name || "Contact", subtitle: ct.title || undefined,
        ring: 4, idx: peopleIdx++, total: Math.max(totalPeople, 1),
        readiness_score: score,
        meta: { email: ct.email, linkedin_url: ct.linkedin_url, outreach_status: ct.outreach_status,
                organization_id: ct.organization_id, persona_id: ct.persona_id },
      });
      contactNodeId.set(ct.id, id);
    }
    // Leadership (embedded in orgs) — synthetic ref_id
    const leaderNodesByOrg = new Map<string, { name: string; role?: string | null; id: string }[]>();
    for (const o of orgs) {
      const leaders = (o.leadership || []) as { name: string; role?: string | null }[];
      const arr: { name: string; role?: string | null; id: string }[] = [];
      for (const L of leaders) {
        // Deterministic-ish synthetic id per leader entry
        const synthId = crypto.randomUUID();
        // Use ref_table=discovery_leadership; ref_id must be stable → hash name+org
        const encoder = new TextEncoder();
        const buf = await crypto.subtle.digest("SHA-1", encoder.encode(`${o.id}|${(L.name || "").toLowerCase()}`));
        const bytes = new Uint8Array(buf).slice(0, 16);
        // Convert to UUID format
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
        const stableId = `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
        const id = await upsertNode({
          kind: "person", ref_table: "discovery_leadership", ref_id: stableId,
          label: L.name, subtitle: L.role || "Leadership",
          ring: 4, idx: peopleIdx++, total: Math.max(totalPeople, 1),
          readiness_score: 25,
          meta: { organization_id: o.id, source: "leadership" },
        });
        arr.push({ name: L.name, role: L.role, id });
      }
      if (arr.length) leaderNodesByOrg.set(o.id, arr);
    }

    // 6. Theme nodes — ring 2 (shared with companies, offset by companies.length)
    const themeNodeId = new Map<string, string>();
    for (let i = 0; i < themes.length; i++) {
      const t = themes[i];
      const id = await upsertNode({
        kind: "theme", ref_table: "discovery_themes", ref_id: t.id,
        label: t.label || "Theme",
        subtitle: t.status || undefined,
        ring: 2, idx: orgs.length + i, total: Math.max(orgs.length + themes.length, 1),
        meta: { campaign_id: t.campaign_id, description: t.description, status: t.status },
      });
      themeNodeId.set(t.id, id);
    }

    // 7. Insight nodes — ring 4 (alongside people)
    const insightNodeId = new Map<string, string>();
    const convoContact = new Map<string, string>();
    for (const cv of conversations) if (cv.contact_id) convoContact.set(cv.id, cv.contact_id);
    const totalRing4 = totalPeople + insights.length;
    for (let i = 0; i < insights.length; i++) {
      const ins = insights[i];
      const text = String(ins.text || "");
      const label = text.length > 80 ? text.slice(0, 77) + "…" : text || "Insight";
      const id = await upsertNode({
        kind: "insight", ref_table: "discovery_insights", ref_id: ins.id,
        label,
        subtitle: ins.is_quote ? "Quote" : (ins.kind || undefined),
        ring: 4, idx: totalPeople + i, total: Math.max(totalRing4, 1),
        meta: { is_quote: ins.is_quote, kind: ins.kind, conversation_id: ins.conversation_id,
                campaign_id: ins.campaign_id, theme_id: ins.theme_id, text },
      });
      insightNodeId.set(ins.id, id);
    }

    for (const [key, id] of existingKey) {
      if (!touched.has(key)) {
        await svc.from("ecosystem_nodes").update({ hidden: true, stale: true }).eq("id", id);
      }
    }

    // Rebuild synced edges — wipe all edges whose source AND target are synced nodes
    // Manual edges (touching manual nodes) are preserved because manual nodes have ref_table NULL.
    // Simpler approach: delete edges where meta->>'synced'='true', then re-insert.
    await svc.from("ecosystem_edges").delete().eq("map_id", map_id).contains("meta", { synced: true });

    async function edge(source: string, target: string, kind: string, note?: string) {
      await svc.from("ecosystem_edges").insert({
        map_id, project_id: projectId,
        source_node_id: source, target_node_id: target, kind,
        note: note ?? null, meta: { synced: true },
      });
    }

    // Segment -serves→ Project
    for (const [, id] of icpNodeId) await edge(id, projectNodeId, "serves");
    // Company -belongs_to→ Segment(s) (via campaign icp_ids)
    for (const o of orgs) {
      const icpIds = campIcp.get(o.campaign_id) || [];
      const from = orgNodeId.get(o.id)!;
      for (const iid of icpIds) {
        const seg = icpNodeId.get(iid);
        if (seg) await edge(from, seg, "belongs_to");
      }
    }
    // Persona-role -serves→ Segment
    for (const p of personas) {
      const from = personaNodeId.get(p.id)!;
      const seg = icpNodeId.get(p.icp_id);
      if (seg) await edge(from, seg, "belongs_to");
    }
    // Org-role -belongs_to→ Company; -belongs_to→ Persona (if mapped)
    for (const r of roles) {
      const from = orgRoleNodeId.get(r.id)!;
      const org = orgNodeId.get(r.organization_id);
      if (org) await edge(from, org, "belongs_to");
      if (r.persona_id) {
        const per = personaNodeId.get(r.persona_id);
        if (per) await edge(from, per, "belongs_to");
      }
    }
    // Contact -belongs_to→ Role/Company/Persona
    for (const ct of contacts) {
      const from = contactNodeId.get(ct.id)!;
      const org = orgNodeId.get(ct.organization_id);
      if (org) await edge(from, org, "belongs_to");
      if (ct.persona_id) {
        const per = personaNodeId.get(ct.persona_id);
        if (per) await edge(from, per, "belongs_to");
      }
    }
    // Leadership -belongs_to→ Company
    for (const [orgId, leaders] of leaderNodesByOrg) {
      const org = orgNodeId.get(orgId);
      if (!org) continue;
      for (const L of leaders) await edge(L.id, org, "belongs_to");
    }
    // Theme -belongs_to→ Segment(s) via its campaign's icp_ids
    for (const t of themes) {
      const from = themeNodeId.get(t.id);
      if (!from) continue;
      const icpIds = campIcp.get(t.campaign_id) || [];
      for (const iid of icpIds) {
        const seg = icpNodeId.get(iid);
        if (seg) await edge(from, seg, "belongs_to");
      }
    }
    // Insight -evidences→ Contact (via conversation.contact_id) and -evidences→ Theme
    for (const ins of insights) {
      const from = insightNodeId.get(ins.id);
      if (!from) continue;
      const contactId = ins.conversation_id ? convoContact.get(ins.conversation_id) : null;
      if (contactId) {
        const ct = contactNodeId.get(contactId);
        if (ct) await edge(from, ct, "evidences");
      }
      if (ins.theme_id) {
        const th = themeNodeId.get(ins.theme_id);
        if (th) await edge(from, th, "evidences");
      }
    }

    // Refresh viewport touched-at
    await svc.from("ecosystem_maps").update({ updated_at: new Date().toISOString() }).eq("id", map_id);

    return new Response(JSON.stringify({
      ok: true,
      counts: {
        segments: icps.length, companies: orgs.length,
        roles: personas.length + roles.length,
        people: contacts.length + Array.from(leaderNodesByOrg.values()).reduce((s, a) => s + a.length, 0),
        themes: themes.length, insights: insights.length,
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("ecosystem-sync error", e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
