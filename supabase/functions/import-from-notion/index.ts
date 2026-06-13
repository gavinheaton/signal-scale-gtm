import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { resolveNotionKey, notionHeaders, NOTION_API, NOTION_NOT_CONFIGURED_ERROR } from "../_shared/notion.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const MAX_BLOCKS = 2000;
const MAX_DEPTH = 5;

function richTextToString(rt: any[]): string {
  if (!Array.isArray(rt)) return "";
  return rt.map((t) => t?.plain_text || "").join("");
}

async function flatten(token: string, blockId: string, depth: number, out: { lines: string[]; count: number }): Promise<void> {
  if (depth > MAX_DEPTH || out.count >= MAX_BLOCKS) return;
  let cursor: string | undefined;
  do {
    const url = new URL(`${NOTION_API}/blocks/${blockId}/children`);
    url.searchParams.set("page_size", "100");
    if (cursor) url.searchParams.set("start_cursor", cursor);
    const r = await fetch(url.toString(), { headers: notionHeaders(token) });
    if (!r.ok) return;
    const body = await r.json();
    for (const b of body.results || []) {
      if (out.count >= MAX_BLOCKS) return;
      out.count++;
      const t = b.type;
      const data = b[t];
      const text = data?.rich_text ? richTextToString(data.rich_text) : "";
      if (t === "heading_1") out.lines.push(`# ${text}`);
      else if (t === "heading_2") out.lines.push(`## ${text}`);
      else if (t === "heading_3") out.lines.push(`### ${text}`);
      else if (t === "bulleted_list_item" || t === "numbered_list_item") out.lines.push(`- ${text}`);
      else if (t === "to_do") out.lines.push(`- [${data?.checked ? "x" : " "}] ${text}`);
      else if (t === "paragraph" || t === "quote" || t === "callout") { if (text) out.lines.push(text); }
      else if (t === "child_page") out.lines.push(`## ${b.child_page?.title || ""}`);
      if (b.has_children) await flatten(token, b.id, depth + 1, out);
    }
    cursor = body.has_more ? body.next_cursor : undefined;
  } while (cursor);
}

const SYSTEM_PROMPT = `You extract B2B GTM strategy artefacts from a Notion page dump.
Return ONLY valid JSON matching this exact shape (no prose, no markdown):
{
  "icps": [{"name":"","company_size":"","industry":"","pain_points":[],"goals":[]}],
  "brand_voice": {"tone_description":"","personality_adjectives":[],"banned_phrases":[],"writing_principles":[]},
  "content_pillars": []
}
If a field is not present in the source, use an empty string or empty array. Do not invent content.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);
    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { project_id } = await req.json();
    if (!project_id) return json({ error: "project_id required" }, 400);

    const service = createClient(supabaseUrl, serviceRoleKey);
    const { data: project } = await service
      .from("projects").select("org_id, notion_strategy_page_id").eq("id", project_id).single();
    if (!project) return json({ error: "Project not found" }, 404);
    const { data: hasAccess } = await service.rpc("user_has_org_access", { _user_id: user.id, _org_id: project.org_id });
    if (!hasAccess) return json({ error: "Forbidden" }, 403);

    const pageId = (project as any).notion_strategy_page_id;
    if (!pageId) return json({ error: "No strategy page configured" }, 400);

    const token = await resolveNotionKey(service, project_id);
    if (!token) return json({ error: NOTION_NOT_CONFIGURED_ERROR }, 400);

    const out = { lines: [] as string[], count: 0 };
    await flatten(token, pageId, 0, out);
    const sourceText = out.lines.join("\n");
    if (!sourceText.trim()) return json({ error: "Notion page is empty or inaccessible" }, 400);

    // Call Claude
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: `Extract structured data from this Notion page:\n\n${sourceText.slice(0, 40000)}` }],
      }),
    });
    const claudeBody = await claudeRes.json();
    if (!claudeRes.ok) return json({ error: `Claude error: ${claudeBody?.error?.message || claudeRes.status}` }, 502);
    const text: string = claudeBody?.content?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return json({ error: "Claude returned no JSON", raw: text }, 502);
    let extracted: unknown;
    try { extracted = JSON.parse(jsonMatch[0]); }
    catch { return json({ error: "Claude returned invalid JSON", raw: text }, 502); }

    return json({ extracted, source_chars: sourceText.length });
  } catch (err: any) {
    return json({ error: err?.message || "Unknown error" }, 500);
  }
});
