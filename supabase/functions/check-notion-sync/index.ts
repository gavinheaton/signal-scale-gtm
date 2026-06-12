import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import { NOTION_API, resolveNotionKey, NOTION_NOT_CONFIGURED_ERROR } from "../_shared/notion.ts";

async function queryNotionDbCount(dbId: string, notionHeaders: Record<string, string>): Promise<{ accessible: boolean; count: number }> {
  try {
    let count = 0;
    let hasMore = true;
    let startCursor: string | undefined;

    while (hasMore) {
      const body: Record<string, unknown> = { page_size: 100 };
      if (startCursor) body.start_cursor = startCursor;

      const res = await fetch(`${NOTION_API}/databases/${dbId}/query`, {
        method: "POST",
        headers: notionHeaders,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        await res.text();
        return { accessible: false, count: 0 };
      }

      const data = await res.json();
      count += data.results?.length || 0;
      hasMore = data.has_more || false;
      startCursor = data.next_cursor;
    }

    return { accessible: true, count };
  } catch {
    return { accessible: false, count: 0 };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { project_id } = await req.json();
    if (!project_id) {
      return new Response(JSON.stringify({ error: "project_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch project
    const { data: project } = await supabase
      .from("projects")
      .select("notion_calendar_db_id, notion_pillars_db_id, notion_foundations_db_id, notion_last_synced_at, notion_workspace_id")
      .eq("id", project_id)
      .single();

    if (!project) {
      return new Response(JSON.stringify({ error: "Project not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Supabase counts
    const [campaignsRes, assetsRes, personasRes] = await Promise.all([
      supabase.from("campaigns").select("id", { count: "exact", head: true }).eq("project_id", project_id),
      supabase.from("campaign_assets").select("id, notion_url, campaign_id", { count: "exact", head: false })
        .in("campaign_id", (await supabase.from("campaigns").select("id").eq("project_id", project_id)).data?.map((c: any) => c.id) || []),
      supabase.from("personas").select("id", { count: "exact", head: true }).eq("project_id", project_id),
    ]);

    const supabaseCounts = {
      campaigns: campaignsRes.count || 0,
      assets: assetsRes.data?.length || 0,
      personas: personasRes.count || 0,
    };

    // Count assets with notion_url set
    const assetsInNotion = assetsRes.data?.filter((a: any) => a.notion_url)?.length || 0;

    // Notion counts
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const NOTION_TOKEN = await resolveNotionKey(adminClient, project_id);
    if (!NOTION_TOKEN) {
      return new Response(JSON.stringify({ error: NOTION_NOT_CONFIGURED_ERROR }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    const notionHeaders = {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    };

    const dbIds = {
      calendar: project.notion_calendar_db_id,
      pillars: project.notion_pillars_db_id,
      foundations: project.notion_foundations_db_id,
    };

    const notionResults: Record<string, { accessible: boolean; count: number }> = {};

    await Promise.all(
      Object.entries(dbIds).map(async ([key, dbId]) => {
        if (dbId) {
          notionResults[key] = await queryNotionDbCount(dbId, notionHeaders);
        } else {
          notionResults[key] = { accessible: false, count: 0 };
        }
      })
    );

    const response = {
      supabase: supabaseCounts,
      notion: {
        calendar_entries: notionResults.calendar?.count || 0,
        pillars: notionResults.pillars?.count || 0,
        foundations: notionResults.foundations?.count || 0,
      },
      last_synced_at: project.notion_last_synced_at || null,
      databases_accessible: {
        calendar: notionResults.calendar?.accessible || false,
        pillars: notionResults.pillars?.accessible || false,
        foundations: notionResults.foundations?.accessible || false,
      },
      gaps: {
        assets_not_in_notion: supabaseCounts.assets - assetsInNotion,
      },
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("check-notion-sync error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
