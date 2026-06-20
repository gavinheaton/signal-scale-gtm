import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import { NOTION_API, resolveNotionKey, NOTION_NOT_CONFIGURED_ERROR } from "../_shared/notion.ts";

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
    } else if (/^\d+\.\s/.test(t)) {
      blocks.push({ object: "block", type: "numbered_list_item", numbered_list_item: { rich_text: text(t.replace(/^\d+\.\s/, "")) } });
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

    const { asset_id } = await req.json();
    if (!asset_id) {
      return new Response(JSON.stringify({ error: "asset_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch asset
    const { data: asset } = await adminClient
      .from("campaign_assets")
      .select("*")
      .eq("id", asset_id)
      .single();

    if (!asset || !asset.content) {
      return new Response(JSON.stringify({ error: "Asset not found or has no content" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch campaign → project → notion_calendar_db_id (and org for authz)
    const { data: campaign } = await adminClient
      .from("campaigns")
      .select("id, name, track, project_id, projects!inner(org_id)")
      .eq("id", asset.campaign_id)
      .single();

    if (!campaign) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: accessOk } = await adminClient.rpc("user_has_org_access", {
      _user_id: user.id, _org_id: (campaign as any).projects.org_id,
    });
    if (!accessOk) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: project } = await adminClient
      .from("projects")
      .select("notion_calendar_db_id, notion_property_map")
      .eq("id", campaign.project_id)
      .single();

    if (!project?.notion_calendar_db_id) {
      return new Response(
        JSON.stringify({ error: "Notion workspace not set up for this project. Run Setup Notion Workspace or Adopt existing first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const NOTION_TOKEN = await resolveNotionKey(adminClient, campaign.project_id);
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

    const demandType = campaign.track === "demand_creation"
      ? "Demand Creation (95%)"
      : "Demand Capture (5%)";

    // App-field-keyed values; translated to user's Notion property names below.
    const appValues: Record<string, unknown> = {
      Title: { title: text(asset.title) },
      Status: { select: { name: "Brief" } },
      Campaign: { rich_text: text(campaign.name) },
      "Demand Type": { select: { name: demandType } },
    };

    const channel = CHANNEL_MAP[asset.asset_type];
    if (channel) appValues.Channel = { select: { name: channel } };

    const contentType = CONTENT_TYPE_MAP[asset.asset_type];
    if (contentType) appValues["Content Type"] = { select: { name: contentType } };

    const today = new Date().toISOString().split("T")[0];
    appValues["Publish Date"] = { date: { start: asset.publish_date || today } };

    if (asset.persona_target_ids && asset.persona_target_ids.length > 0) {
      const { data: personas } = await adminClient
        .from("personas")
        .select("persona_name")
        .in("id", asset.persona_target_ids);
      if (personas && personas.length > 0) {
        appValues.Persona = { rich_text: text(personas.map(p => p.persona_name).join(", ")) };
      }
    }

    // Default identity map (used when no adopted-workspace property map exists):
    const DEFAULT_MAP: Record<string, string> = {
      Title: "Content", Status: "Status", Campaign: "Campaign",
      "Demand Type": "Demand Type", Channel: "Channel", "Content Type": "Content Type",
      "Publish Date": "Publish Date", Persona: "Persona",
    };
    const calendarMap = ((project as any).notion_property_map?.calendar as Record<string, string> | undefined)
      || DEFAULT_MAP;

    const properties: Record<string, unknown> = {};
    for (const [appField, value] of Object.entries(appValues)) {
      const userProp = calendarMap[appField];
      if (userProp) properties[userProp] = value;
    }


    // Content as page body blocks
    const contentBlocks = markdownToBlocks(asset.content);
    const children = contentBlocks.slice(0, 100);

    const notionRes = await fetch(`${NOTION_API}/pages`, {
      method: "POST",
      headers: notionHeaders,
      body: JSON.stringify({
        parent: { database_id: project.notion_calendar_db_id },
        properties,
        children,
      }),
    });

    if (!notionRes.ok) {
      const errText = await notionRes.text();
      console.error("Notion API error:", errText);
      let userMessage = "Notion API error";
      try {
        const parsed = JSON.parse(errText);
        if (parsed.code === "object_not_found") {
          userMessage = "The Content Calendar database is not shared with the integration. Open it in Notion → Share → Add the integration.";
        } else if (parsed.code === "unauthorized") {
          userMessage = "The Notion API key is invalid or expired.";
        } else {
          userMessage = parsed.message || userMessage;
        }
      } catch {}
      return new Response(JSON.stringify({ error: userMessage, details: errText }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const notionData = await notionRes.json();
    const notionUrl = notionData.url || null;

    // Update asset with Notion URL
    await adminClient
      .from("campaign_assets")
      .update({ notion_url: notionUrl })
      .eq("id", asset_id);

    // Update last synced timestamp on project
    await adminClient
      .from("projects")
      .update({ notion_last_synced_at: new Date().toISOString() })
      .eq("id", campaign.project_id);

    return new Response(JSON.stringify({ notion_url: notionUrl, asset_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("push-asset-to-notion error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
