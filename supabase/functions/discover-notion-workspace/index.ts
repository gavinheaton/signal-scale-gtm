import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import { NOTION_API, notionHeaders, resolveNotionKey, NOTION_NOT_CONFIGURED_ERROR } from "../_shared/notion.ts";
import { extractNotionId } from "../_shared/notion-mapping.ts";

interface DatabaseManifest {
  id: string;
  title: string;
  properties: { name: string; type: string }[];
}

async function fetchChildren(blockId: string, headers: Record<string, string>): Promise<any[]> {
  const all: any[] = [];
  let cursor: string | undefined;
  do {
    const url = new URL(`${NOTION_API}/blocks/${blockId}/children`);
    url.searchParams.set("page_size", "100");
    if (cursor) url.searchParams.set("start_cursor", cursor);
    const res = await fetch(url.toString(), { headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Notion children fetch failed (${res.status}): ${text}`);
    }
    const data = await res.json();
    all.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return all;
}

async function discoverDatabases(
  parentId: string,
  headers: Record<string, string>,
  depth = 0,
  seen = new Set<string>(),
): Promise<DatabaseManifest[]> {
  if (depth > 2 || seen.has(parentId)) return [];
  seen.add(parentId);

  const results: DatabaseManifest[] = [];
  let children: any[];
  try {
    children = await fetchChildren(parentId, headers);
  } catch {
    return results;
  }

  for (const block of children) {
    if (block.type === "child_database") {
      try {
        const dbRes = await fetch(`${NOTION_API}/databases/${block.id}`, { headers });
        if (dbRes.ok) {
          const db = await dbRes.json();
          const title = (db.title || [])
            .map((t: any) => t.plain_text)
            .join("")
            .trim() || block.child_database?.title || "Untitled";
          const properties = Object.entries(db.properties || {}).map(
            ([name, def]: [string, any]) => ({ name, type: def.type }),
          );
          results.push({ id: db.id, title, properties });
        }
      } catch {
        // ignore single-db errors
      }
    } else if (block.has_children && block.type !== "child_database") {
      const nested = await discoverDatabases(block.id, headers, depth + 1, seen);
      results.push(...nested);
    }
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { project_id, parent_page_url } = await req.json();
    if (!project_id || !parent_page_url) {
      return new Response(JSON.stringify({ error: "project_id and parent_page_url required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Auth check: admin+ on the project's org
    const { data: project } = await adminClient
      .from("projects").select("org_id").eq("id", project_id).single();
    if (!project) {
      return new Response(JSON.stringify({ error: "Project not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: hasRole } = await adminClient.rpc("user_has_org_role", {
      _user_id: user.id, _org_id: project.org_id, _roles: ["admin", "owner", "superadmin"],
    });
    if (!hasRole) {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = await resolveNotionKey(adminClient, project_id);
    if (!token) {
      return new Response(JSON.stringify({ error: NOTION_NOT_CONFIGURED_ERROR }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parentId = extractNotionId(parent_page_url);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parentId)) {
      return new Response(JSON.stringify({ error: "Could not parse a Notion page ID from that URL" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const headers = notionHeaders(token);

    // Verify parent page is reachable
    const pageRes = await fetch(`${NOTION_API}/pages/${parentId}`, { headers });
    if (!pageRes.ok) {
      const text = await pageRes.text();
      let msg = "Could not access that page. Make sure the page is shared with your Notion integration.";
      try {
        const parsed = JSON.parse(text);
        if (parsed.code === "unauthorized") msg = "Your Notion API key is invalid.";
        else if (parsed.code === "object_not_found") msg = "Page not found, or not shared with the integration.";
      } catch {}
      return new Response(JSON.stringify({ error: msg }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const page = await pageRes.json();
    const pageTitle = Object.values(page.properties || {})
      .flatMap((p: any) => p.title || [])
      .map((t: any) => t.plain_text).join("") || "Notion Page";

    const databases = await discoverDatabases(parentId, headers);

    return new Response(JSON.stringify({
      parent_page_id: parentId,
      parent_page_title: pageTitle,
      databases,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("discover-notion-workspace error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
