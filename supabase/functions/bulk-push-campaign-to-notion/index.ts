import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";

const NOTION_API = "https://api.notion.com/v1";

const CHANNEL_MAP: Record<string, string> = {
  blog: "Blog",
  video: "YouTube",
  podcast: "Podcast",
  linkedin_post: "LinkedIn",
  email: "Email",
  webinar: "Blog",
  whitepaper: "Blog",
  press_release: "PR",
};

const CONTENT_TYPE_MAP: Record<string, string> = {
  blog: "Article",
  video: "Video",
  podcast: "Audio",
  linkedin_post: "Post",
  email: "Email",
  webinar: "Video",
  whitepaper: "Report",
  press_release: "Article",
};

function text(content: string) {
  return [{ type: "text", text: { content } }];
}

function markdownToBlocks(markdown: string): unknown[] {
  const blocks: unknown[] = [];
  for (const line of markdown.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith("### ")) {
      blocks.push({ object: "block", type: "heading_3", heading_3: { rich_text: text(t.slice(4)) } });
    } else if (t.startsWith("## ")) {
      blocks.push({ object: "block", type: "heading_2", heading_2: { rich_text: text(t.slice(3)) } });
    } else if (t.startsWith("# ")) {
      blocks.push({ object: "block", type: "heading_1", heading_1: { rich_text: text(t.slice(2)) } });
    } else if (t.startsWith("- ") || t.startsWith("* ")) {
      blocks.push({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: text(t.slice(2)) } });
    } else {
      blocks.push({ object: "block", type: "paragraph", paragraph: { rich_text: text(t) } });
    }
  }
  return blocks;
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

    const { campaign_id } = await req.json();
    if (!campaign_id) {
      return new Response(JSON.stringify({ error: "campaign_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch campaign
    const { data: campaign } = await adminClient
      .from("campaigns")
      .select("id, name, track, project_id, objective")
      .eq("id", campaign_id)
      .single();

    if (!campaign) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get project's notion_calendar_db_id
    const { data: project } = await adminClient
      .from("projects")
      .select("notion_calendar_db_id")
      .eq("id", campaign.project_id)
      .single();

    if (!project?.notion_calendar_db_id) {
      return new Response(
        JSON.stringify({ error: "Notion workspace not set up for this project. Run Setup Notion Workspace first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const NOTION_TOKEN = Deno.env.get("NOTION_API_KEY");
    if (!NOTION_TOKEN) {
      return new Response(JSON.stringify({ error: "Notion API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all assets with content that haven't been pushed yet
    const { data: assets } = await adminClient
      .from("campaign_assets")
      .select("*")
      .eq("campaign_id", campaign_id)
      .not("content", "is", null)
      .is("notion_url", null);

    if (!assets || assets.length === 0) {
      return new Response(JSON.stringify({ error: "No assets with content to push" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const notionHeaders = {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    };

    const demandType = campaign.track === "demand_creation"
      ? "Demand Creation (95%)"
      : "Demand Capture (5%)";

    let itemsPushed = 0;

    // Create individual database entries per asset
    for (const asset of assets) {
      const properties: Record<string, unknown> = {
        Content: { title: text(asset.title) },
        Status: { select: { name: "Brief" } },
        Campaign: { rich_text: text(campaign.name) },
        "Demand Type": { select: { name: demandType } },
      };

      const channel = CHANNEL_MAP[asset.asset_type];
      if (channel) properties.Channel = { select: { name: channel } };

      const contentType = CONTENT_TYPE_MAP[asset.asset_type];
      if (contentType) properties["Content Type"] = { select: { name: contentType } };

      const today = new Date().toISOString().split("T")[0];
      properties["Publish Date"] = { date: { start: asset.publish_date || today } };

      // Resolve persona names
      if (asset.persona_target_ids && asset.persona_target_ids.length > 0) {
        const { data: personas } = await adminClient
          .from("personas")
          .select("persona_name")
          .in("id", asset.persona_target_ids);
        if (personas && personas.length > 0) {
          properties.Persona = { rich_text: text(personas.map(p => p.persona_name).join(", ")) };
        }
      }

      // Content as page body
      const contentBlocks = markdownToBlocks(asset.content || "");
      const children = contentBlocks.slice(0, 100);

      try {
        const res = await fetch(`${NOTION_API}/pages`, {
          method: "POST",
          headers: notionHeaders,
          body: JSON.stringify({
            parent: { database_id: project.notion_calendar_db_id },
            properties,
            children,
          }),
        });

        if (res.ok) {
          itemsPushed++;
          const notionPage = await res.json();
          const pageUrl = notionPage.url || null;
          if (pageUrl) {
            await adminClient
              .from("campaign_assets")
              .update({ notion_url: pageUrl })
              .eq("id", asset.id);
          }
        } else {
          const errText = await res.text();
          console.error(`Failed to push "${asset.title}" to Notion:`, errText);
        }
      } catch (e) {
        console.error(`Error pushing "${asset.title}":`, e);
      }
    }

    // Update campaign notion_url to the calendar DB link
    const calendarUrl = `https://notion.so/${project.notion_calendar_db_id.replace(/-/g, "")}`;
    await adminClient
      .from("campaigns")
      .update({ notion_url: calendarUrl })
      .eq("id", campaign_id);

    // Update last synced timestamp
    await adminClient
      .from("projects")
      .update({ notion_last_synced_at: new Date().toISOString() })
      .eq("id", campaign.project_id);

    return new Response(JSON.stringify({ success: true, assets_pushed: itemsPushed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("bulk-push-campaign-to-notion error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
