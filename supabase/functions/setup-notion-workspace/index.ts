import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";

const NOTION_API = "https://api.notion.com/v1";

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
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
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

    // Use service role for DB writes
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch project
    const { data: project, error: projErr } = await adminClient
      .from("projects")
      .select("id, name, org_id")
      .eq("id", project_id)
      .single();

    if (projErr || !project) {
      return new Response(JSON.stringify({ error: "Project not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const NOTION_TOKEN = Deno.env.get("NOTION_API_KEY");
    const PARENT_PAGE_ID = Deno.env.get("NOTION_CAMPAIGN_BRIEFS_PAGE_ID");

    if (!NOTION_TOKEN || !PARENT_PAGE_ID) {
      return new Response(JSON.stringify({ error: "Notion secrets not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const notionHeaders = {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    };

    // Step 1: Create workspace page
    const pageRes = await fetch(`${NOTION_API}/pages`, {
      method: "POST",
      headers: notionHeaders,
      body: JSON.stringify({
        parent: { page_id: PARENT_PAGE_ID },
        icon: { type: "emoji", emoji: "🎯" },
        properties: {
          title: [{ text: { content: `${project.name} — GTM Workspace` } }],
        },
        children: [
          {
            object: "block",
            type: "heading_1",
            heading_1: { rich_text: [{ type: "text", text: { content: "Content Calendar" } }] },
          },
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [
                {
                  type: "text",
                  text: {
                    content:
                      "Central hub for all content planning, production scheduling, and publishing across channels.",
                  },
                },
              ],
            },
          },
        ],
      }),
    });

    if (!pageRes.ok) {
      const err = await pageRes.text();
      console.error("Notion page creation failed:", err);
      return new Response(JSON.stringify({ error: "Failed to create Notion workspace page", details: err }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pageData = await pageRes.json();
    const workspacePageId = pageData.id;

    // Step 2: Create Content Calendar database
    const dbRes = await fetch(`${NOTION_API}/databases`, {
      method: "POST",
      headers: notionHeaders,
      body: JSON.stringify({
        parent: { page_id: workspacePageId },
        icon: { type: "emoji", emoji: "📅" },
        title: [{ type: "text", text: { content: "Content Calendar" } }],
        is_inline: false,
        properties: {
          Content: { title: {} },
          Status: {
            select: {
              options: [
                { name: "Idea", color: "gray" },
                { name: "Brief", color: "blue" },
                { name: "In Production", color: "yellow" },
                { name: "Review", color: "orange" },
                { name: "Scheduled", color: "purple" },
                { name: "Published", color: "green" },
                { name: "Archived", color: "default" },
              ],
            },
          },
          Channel: {
            select: {
              options: [
                { name: "LinkedIn", color: "blue" },
                { name: "Email", color: "purple" },
                { name: "Blog", color: "green" },
                { name: "Instagram", color: "pink" },
                { name: "YouTube", color: "red" },
                { name: "Podcast", color: "orange" },
                { name: "PR", color: "yellow" },
                { name: "Paid", color: "gray" },
              ],
            },
          },
          "Content Type": {
            select: {
              options: [
                { name: "Post", color: "blue" },
                { name: "Article", color: "green" },
                { name: "Email", color: "purple" },
                { name: "Video", color: "red" },
                { name: "Infographic", color: "yellow" },
                { name: "Case Study", color: "orange" },
                { name: "Report", color: "gray" },
                { name: "Ad", color: "pink" },
              ],
            },
          },
          "Demand Type": {
            select: {
              options: [
                { name: "Demand Creation (95%)", color: "blue" },
                { name: "Demand Capture (5%)", color: "green" },
              ],
            },
          },
          "Publish Date": { date: {} },
          "Production Due": { date: {} },
          Campaign: { rich_text: {} },
          Persona: { rich_text: {} },
          Format: {
            select: {
              options: [
                { name: "Long-form", color: "blue" },
                { name: "Short-form", color: "green" },
                { name: "Visual", color: "yellow" },
                { name: "Audio", color: "orange" },
                { name: "Interactive", color: "purple" },
              ],
            },
          },
          "Assigned To": { people: {} },
          "Brief URL": { url: {} },
          Notes: { rich_text: {} },
        },
      }),
    });

    if (!dbRes.ok) {
      const err = await dbRes.text();
      console.error("Notion database creation failed:", err);
      return new Response(
        JSON.stringify({ error: "Failed to create Notion database", details: err }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const dbData = await dbRes.json();
    const calendarDbId = dbData.id;

    // Step 3: Attempt to create views (best-effort, may fail on older API versions)
    const viewsToCreate = [
      { type: "table", name: "All Content" },
      { type: "board", name: "Pipeline", group_by: "Status" },
      { type: "calendar", name: "Publish Calendar", calendar_by: "Publish Date" },
      { type: "calendar", name: "Production Calendar", calendar_by: "Production Due" },
      { type: "board", name: "95-5 Balance", group_by: "Demand Type" },
    ];

    const viewHeaders = {
      ...notionHeaders,
      "Notion-Version": "2025-09-03",
    };

    for (const view of viewsToCreate) {
      try {
        const viewBody: Record<string, unknown> = {
          database_id: calendarDbId,
          title: view.name,
          type: view.type,
        };

        if (view.type === "board" && view.group_by) {
          viewBody.board = { group_by: view.group_by };
        }
        if (view.type === "calendar" && view.calendar_by) {
          viewBody.calendar = { calendar_by: view.calendar_by };
        }

        const viewRes = await fetch(`${NOTION_API}/views`, {
          method: "POST",
          headers: viewHeaders,
          body: JSON.stringify(viewBody),
        });

        if (!viewRes.ok) {
          const viewErr = await viewRes.text();
          console.warn(`View "${view.name}" creation failed (non-critical):`, viewErr);
          await viewRes.text().catch(() => {});
        } else {
          await viewRes.json();
        }
      } catch (e) {
        console.warn(`View "${view.name}" creation error (non-critical):`, e);
      }
    }

    // Step 4: Update project with Notion IDs
    const { error: updateErr } = await adminClient
      .from("projects")
      .update({
        notion_workspace_id: workspacePageId,
        notion_calendar_db_id: calendarDbId,
      })
      .eq("id", project_id);

    if (updateErr) {
      console.error("Failed to update project:", updateErr);
    }

    const workspaceUrl = `https://notion.so/${workspacePageId.replace(/-/g, "")}`;

    return new Response(
      JSON.stringify({
        success: true,
        workspace_url: workspaceUrl,
        workspace_id: workspacePageId,
        calendar_db_id: calendarDbId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
