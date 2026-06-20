import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { resolveNotionKey, notionHeaders, NOTION_API, NOTION_NOT_CONFIGURED_ERROR } from "../_shared/notion.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// --- block helpers ---
type Block = Record<string, unknown>;
const rt = (text: string) => [{ type: "text", text: { content: text.slice(0, 1900) } }];
const heading = (level: 1 | 2 | 3, text: string): Block => ({
  object: "block",
  type: `heading_${level}`,
  [`heading_${level}`]: { rich_text: rt(text) },
});
const para = (text: string): Block => ({ object: "block", type: "paragraph", paragraph: { rich_text: rt(text) } });
const divider = (): Block => ({ object: "block", type: "divider", divider: {} });

function summarizeObj(obj: unknown): string {
  if (!obj || typeof obj !== "object") return "";
  return Object.entries(obj as Record<string, unknown>)
    .filter(([, v]) => v != null && (typeof v !== "object" || Object.keys(v as object).length > 0))
    .map(([k, v]) => {
      const val = typeof v === "string" ? v : Array.isArray(v) ? v.join(", ") : JSON.stringify(v);
      return `${k.replace(/_/g, " ")}: ${val}`;
    })
    .join(" • ");
}

function asArray(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).map((x) => String(x));
  return [String(v)];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { project_id } = await req.json();
    if (!project_id) return json({ error: "project_id required" }, 400);

    const service = createClient(supabaseUrl, serviceRoleKey);

    const { data: project, error: projErr } = await service
      .from("projects")
      .select("id, name, org_id, notion_strategy_page_id")
      .eq("id", project_id)
      .single();
    if (projErr || !project) return json({ error: "Project not found" }, 404);

    const { data: hasAccess } = await service.rpc("user_has_org_access", { _user_id: user.id, _org_id: project.org_id });
    if (!hasAccess) return json({ error: "Forbidden" }, 403);

    const pageId = (project as any).notion_strategy_page_id;
    if (!pageId) return json({ error: "No strategy page configured" }, 400);

    const token = await resolveNotionKey(service, project_id);
    if (!token) return json({ error: NOTION_NOT_CONFIGURED_ERROR }, 400);
    const headers = notionHeaders(token);

    // Load artefacts
    const [{ data: icps }, { data: bvs }, { data: campaigns }] = await Promise.all([
      service.from("icps").select("*").eq("project_id", project_id),
      service.from("brand_voices").select("*").eq("project_id", project_id).eq("status", "complete").order("updated_at", { ascending: false }).limit(1),
      service.from("campaigns").select("*").eq("project_id", project_id).in("status", ["planning", "active"]),
    ]);
    const brandVoice = bvs?.[0] as any;

    // Build blocks
    const blocks: Block[] = [];
    blocks.push(heading(1, `Strategy artefacts — ${project.name}`));
    blocks.push(para(`Last synced from Signal+Scale: ${new Date().toISOString()}`));
    blocks.push(divider());

    blocks.push(heading(2, "Ideal customer profiles"));
    if (!icps?.length) {
      blocks.push(para("No ICPs defined yet."));
    } else {
      for (const icp of icps) {
        blocks.push(heading(3, icp.segment_name));
        const firm = summarizeObj(icp.firmographics);
        if (firm) blocks.push(para(`Company profile — ${firm}`));
        const psycho = summarizeObj(icp.psychographics);
        if (psycho) blocks.push(para(`Pain points & motivations — ${psycho}`));
        const anti = summarizeObj(icp.anti_icp_signals);
        blocks.push(para(`Fit signals — fit ${icp.fit_score}/10, access ${icp.access_score}/10, category: ${icp.matrix_category}${anti ? ` • anti-ICP: ${anti}` : ""}`));
      }
    }

    blocks.push(divider());
    blocks.push(heading(2, "Brand voice"));
    if (!brandVoice) {
      blocks.push(para("Brand voice not yet completed."));
    } else {
      if (brandVoice.tone_description) blocks.push(para(`Tone — ${brandVoice.tone_description}`));
      const adj = asArray(brandVoice.personality_adjectives);
      if (adj.length) blocks.push(para(`Personality — ${adj.join(", ")}`));
      const banned = asArray(brandVoice.banned_phrases);
      if (banned.length) blocks.push(para(`Banned phrases — ${banned.join(", ")}`));
      const principles = asArray(brandVoice.writing_principles);
      if (principles.length) blocks.push(para(`Writing principles — ${principles.join(" • ")}`));
    }

    blocks.push(divider());
    blocks.push(heading(2, "Active campaigns"));
    if (!campaigns?.length) {
      blocks.push(para("No active campaigns."));
    } else {
      // resolve target ICP names
      const icpMap = new Map((icps || []).map((i: any) => [i.id, i.segment_name]));
      for (const c of campaigns as any[]) {
        blocks.push(heading(3, c.name));
        if (c.objective) blocks.push(para(`Goal — ${c.objective}`));
        const targets = (c.target_icp_ids || []).map((id: string) => icpMap.get(id) || id).join(", ");
        if (targets) blocks.push(para(`Target ICPs — ${targets}`));
        const window = `${c.launch_date || "TBD"} → ${c.end_date || "TBD"}`;
        blocks.push(para(`Timeline — ${window} • track: ${c.track} • status: ${c.status}`));
      }
    }

    // Clear existing children
    let cursor: string | undefined;
    const existing: string[] = [];
    do {
      const url = new URL(`${NOTION_API}/blocks/${pageId}/children`);
      url.searchParams.set("page_size", "100");
      if (cursor) url.searchParams.set("start_cursor", cursor);
      const r = await fetch(url.toString(), { headers });
      const body = await r.json();
      if (!r.ok) return json({ error: `Notion read failed: ${body?.message || r.status}` }, 502);
      for (const b of body.results || []) existing.push(b.id);
      cursor = body.has_more ? body.next_cursor : undefined;
    } while (cursor);

    for (const id of existing) {
      const r = await fetch(`${NOTION_API}/blocks/${id}`, { method: "DELETE", headers });
      if (!r.ok && r.status !== 404) {
        const body = await r.json().catch(() => ({}));
        return json({ error: `Notion delete failed: ${body?.message || r.status}` }, 502);
      }
    }

    // Append new blocks in batches of 100
    for (let i = 0; i < blocks.length; i += 100) {
      const batch = blocks.slice(i, i + 100);
      const r = await fetch(`${NOTION_API}/blocks/${pageId}/children`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ children: batch }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        return json({ error: `Notion append failed: ${body?.message || r.status}` }, 502);
      }
    }

    const synced_at = new Date().toISOString();
    await service.from("projects").update({ notion_strategy_synced_at: synced_at } as any).eq("id", project_id);

    return json({ success: true, synced_at, blocks_written: blocks.length });
  } catch (err: any) {
    return json({ error: err?.message || "Unknown error" }, 500);
  }
});
