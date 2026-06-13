import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { resolveNotionKey, notionHeaders, NOTION_API, NOTION_NOT_CONFIGURED_ERROR } from "../_shared/notion.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function extractTitle(page: any): string {
  const props = page?.properties || {};
  for (const v of Object.values(props) as any[]) {
    if (v?.type === "title" && Array.isArray(v.title) && v.title.length) {
      return v.title.map((t: any) => t.plain_text).join("");
    }
  }
  return "(untitled)";
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

    const { project_id, page_id } = await req.json();
    if (!project_id) return json({ error: "project_id required" }, 400);

    const service = createClient(supabaseUrl, serviceRoleKey);
    const { data: project } = await service
      .from("projects")
      .select("org_id, notion_strategy_page_id")
      .eq("id", project_id)
      .single();
    if (!project) return json({ error: "Project not found" }, 404);
    const { data: hasAccess } = await service.rpc("user_has_org_access", { _user_id: user.id, _org_id: project.org_id });
    if (!hasAccess) return json({ error: "Forbidden" }, 403);

    const pid = (page_id || (project as any).notion_strategy_page_id || "").replace(/-/g, "");
    if (!pid) return json({ error: "No page id provided" }, 400);

    const token = await resolveNotionKey(service, project_id);
    if (!token) return json({ error: NOTION_NOT_CONFIGURED_ERROR }, 400);

    const r = await fetch(`${NOTION_API}/pages/${pid}`, { headers: notionHeaders(token) });
    const body = await r.json();
    if (!r.ok) return json({ ok: false, error: body?.message || `Notion error ${r.status}` }, 200);
    return json({ ok: true, title: extractTitle(body), page_id: pid });
  } catch (err: any) {
    return json({ error: err?.message || "Unknown error" }, 500);
  }
});
