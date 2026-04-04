import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";

const NOTION_API = "https://api.notion.com/v1";

function extractNotionId(input: string): string {
  if (/^[0-9a-f]{8}-/.test(input)) return input;
  const match = input.match(/([0-9a-f]{32})/);
  if (match) {
    const h = match[1];
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  return input;
}

function text(content: string) {
  return [{ type: "text", text: { content } }];
}

function heading2(content: string) {
  return { object: "block", type: "heading_2", heading_2: { rich_text: text(content) } };
}

function heading3(content: string) {
  return { object: "block", type: "heading_3", heading_3: { rich_text: text(content) } };
}

function paragraph(content: string) {
  return { object: "block", type: "paragraph", paragraph: { rich_text: text(content) } };
}

function bulletItem(content: string) {
  return { object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: text(content) } };
}

function todoItem(content: string) {
  return { object: "block", type: "to_do", to_do: { rich_text: text(content), checked: false } };
}

// Content Calendar database schema shared across main + per-channel databases
function calendarProperties(pillarsDbId?: string) {
  const props: Record<string, unknown> = {
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
          { name: "TikTok", color: "yellow" },
          { name: "PR", color: "gray" },
          { name: "Paid", color: "default" },
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
          { name: "Audio", color: "default" },
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
  };

  if (pillarsDbId) {
    props["Pillar"] = {
      relation: { database_id: pillarsDbId, single_property: {} },
    };
  }

  return props;
}

async function notionFetch(
  path: string,
  method: string,
  body: unknown,
  headers: Record<string, string>
) {
  const res = await fetch(`${NOTION_API}${path}`, {
    method,
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Notion ${method} ${path} failed (${res.status}): ${errText}`);
  }
  return res.json();
}

async function appendChildren(
  pageId: string,
  blocks: unknown[],
  headers: Record<string, string>
) {
  // Notion accepts max 100 children per append
  for (let i = 0; i < blocks.length; i += 100) {
    const batch = blocks.slice(i, i + 100);
    await notionFetch(`/blocks/${pageId}/children`, "PATCH", { children: batch }, headers);
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

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

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

    const normalizedParentPageId = extractNotionId(PARENT_PAGE_ID);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalizedParentPageId)) {
      return new Response(
        JSON.stringify({ error: "NOTION_CAMPAIGN_BRIEFS_PAGE_ID must be a valid Notion page ID or URL" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const notionHeaders = {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    };

    // ── STEP 1: Create parent workspace page ──
    // Start with Section 1 (This Week) children directly in page creation
    const initialChildren = [
      heading2("This week"),
      // Weekly planning table: header row + empty row
      {
        object: "block",
        type: "table",
        table: {
          table_width: 6,
          has_column_header: true,
          has_row_header: false,
          children: [
            {
              type: "table_row",
              table_row: {
                cells: [
                  text("Monday"),
                  text("Tuesday"),
                  text("Wednesday"),
                  text("Thursday"),
                  text("Friday"),
                  text("Next week"),
                ],
              },
            },
            {
              type: "table_row",
              table_row: {
                cells: [
                  text(""),
                  text(""),
                  text(""),
                  text(""),
                  text(""),
                  text(""),
                ],
              },
            },
          ],
        },
      },
      // Quick to-do list below the table for daily tasks
      todoItem("Monday priority"),
      todoItem("Tuesday priority"),
      todoItem("Wednesday priority"),
      todoItem("Thursday priority"),
      todoItem("Friday priority"),
    ];

    const pageData = await notionFetch("/pages", "POST", {
      parent: { page_id: normalizedParentPageId },
      icon: { type: "emoji", emoji: "🎯" },
      cover: {
        type: "external",
        external: { url: "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=1200" },
      },
      properties: {
        title: [{ text: { content: `${project.name} — GTM Workspace` } }],
      },
      children: initialChildren,
    }, notionHeaders);

    const workspacePageId = pageData.id;

    // ── STEP 2: Create Content Pillars database (inline) ──
    const pillarsHeading = heading2("Pillars");
    await appendChildren(workspacePageId, [pillarsHeading], notionHeaders);

    const pillarsDb = await notionFetch("/databases", "POST", {
      parent: { page_id: workspacePageId },
      icon: { type: "emoji", emoji: "🏛️" },
      title: [{ type: "text", text: { content: "Content Pillars" } }],
      is_inline: true,
      properties: {
        Pillar: { title: {} },
        Description: { rich_text: {} },
        Colour: {
          select: {
            options: [
              { name: "Red", color: "red" },
              { name: "Blue", color: "blue" },
              { name: "Green", color: "green" },
              { name: "Yellow", color: "yellow" },
            ],
          },
        },
        Active: { checkbox: {} },
      },
    }, notionHeaders);

    const pillarsDbId = pillarsDb.id;

    // Create 4 placeholder pillar pages
    for (let i = 1; i <= 4; i++) {
      await notionFetch("/pages", "POST", {
        parent: { database_id: pillarsDbId },
        properties: {
          Pillar: { title: text(`Content Pillar #${i}`) },
          Active: { checkbox: true },
        },
      }, notionHeaders);
    }

    // ── STEP 3: Create Strategic Foundations database (inline) ──
    const foundationsHeading = heading2("Foundations");
    await appendChildren(workspacePageId, [foundationsHeading], notionHeaders);

    const foundationsDb = await notionFetch("/databases", "POST", {
      parent: { page_id: workspacePageId },
      icon: { type: "emoji", emoji: "🧱" },
      title: [{ type: "text", text: { content: "Strategic Foundations" } }],
      is_inline: true,
      properties: {
        Foundation: { title: {} },
        Detail: { rich_text: {} },
        Type: {
          select: {
            options: [
              { name: "Audience", color: "blue" },
              { name: "Growth Goal", color: "green" },
              { name: "Outcome", color: "purple" },
              { name: "Motivation", color: "orange" },
              { name: "Industry", color: "yellow" },
              { name: "Other", color: "gray" },
            ],
          },
        },
      },
    }, notionHeaders);

    const foundationsDbId = foundationsDb.id;

    // Create 5 foundation placeholder pages
    const foundationItems = ["Audience", "Growth Goal", "Outcome", "Motivation", "Industry"];
    for (const item of foundationItems) {
      await notionFetch("/pages", "POST", {
        parent: { database_id: foundationsDbId },
        properties: {
          Foundation: { title: text(item) },
          Type: { select: { name: item } },
        },
      }, notionHeaders);
    }

    // ── STEP 4: Reference sidebar (3-column layout) ──
    const sidebarBlock = {
      object: "block",
      type: "column_list",
      column_list: {
        children: [
          {
            object: "block",
            type: "column",
            column: {
              children: [
                heading3("Links"),
                bulletItem("YouTube"),
                bulletItem("Instagram"),
                bulletItem("LinkedIn"),
                bulletItem("TikTok"),
                bulletItem("Brand Identity"),
                bulletItem("Full view of content"),
              ],
            },
          },
          {
            object: "block",
            type: "column",
            column: {
              children: [
                heading3("Templates"),
                bulletItem("Campaign Brief Template"),
                bulletItem("LinkedIn Post Template"),
                bulletItem("Email Template"),
                bulletItem("Content Brief"),
              ],
            },
          },
          {
            object: "block",
            type: "column",
            column: {
              children: [
                heading3("Branding"),
                bulletItem("Primary Colour — #000000"),
                bulletItem("Accent Colour — #000000"),
                bulletItem("Highlight Colour — #000000"),
                bulletItem("Font — (set your brand font)"),
              ],
            },
          },
        ],
      },
    };

    await appendChildren(workspacePageId, [sidebarBlock], notionHeaders);

    // ── STEP 5: Content Schedule — main Content Calendar database ──
    const scheduleHeading = heading2("Content Schedule");
    await appendChildren(workspacePageId, [scheduleHeading], notionHeaders);

    const calendarDb = await notionFetch("/databases", "POST", {
      parent: { page_id: workspacePageId },
      icon: { type: "emoji", emoji: "📅" },
      title: [{ type: "text", text: { content: "Content Calendar" } }],
      is_inline: true,
      properties: calendarProperties(pillarsDbId),
    }, notionHeaders);

    const calendarDbId = calendarDb.id;

    // ── STEP 6: Per-channel sections ──
    // NOTE: Notion API does not support creating linked/filtered views of existing databases.
    // These are separate inline databases per channel. Users should set up linked views manually
    // in Notion for a unified experience once the workspace is created.
    const channels = ["LinkedIn", "Email", "TikTok", "Instagram", "YouTube"];

    for (const channel of channels) {
      await appendChildren(workspacePageId, [
        heading2(channel),
        heading3("Calendar"),
      ], notionHeaders);

      // Create a per-channel inline database with same schema
      await notionFetch("/databases", "POST", {
        parent: { page_id: workspacePageId },
        icon: { type: "emoji", emoji: channel === "LinkedIn" ? "💼" : channel === "Email" ? "✉️" : channel === "TikTok" ? "🎵" : channel === "Instagram" ? "📸" : "🎬" },
        title: [{ type: "text", text: { content: `${channel} Calendar` } }],
        is_inline: true,
        properties: calendarProperties(pillarsDbId),
      }, notionHeaders);
    }

    // ── STEP 7: Ideas section ──
    await appendChildren(workspacePageId, [
      heading2("Ideas"),
      paragraph(
        "Filter the main Content Calendar by Status = \"Idea\" to see all content ideas. " +
        "(Linked views cannot be created via the Notion API — set up a filtered view manually in Notion for the best experience.)"
      ),
    ], notionHeaders);

    // ── STEP 8: Update project record with all Notion IDs ──
    const { error: updateErr } = await adminClient
      .from("projects")
      .update({
        notion_workspace_id: workspacePageId,
        notion_calendar_db_id: calendarDbId,
        notion_pillars_db_id: pillarsDbId,
        notion_foundations_db_id: foundationsDbId,
        notion_last_synced_at: new Date().toISOString(),
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
        calendar_db_id: calendarDbId,
        pillars_db_id: pillarsDbId,
        foundations_db_id: foundationsDbId,
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
