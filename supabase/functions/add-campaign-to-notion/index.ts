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

    // Fetch campaign with project info
    const { data: campaign, error: campErr } = await adminClient
      .from("campaigns")
      .select("id, name, track, project_id")
      .eq("id", campaign_id)
      .single();

    if (campErr || !campaign) {
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
        JSON.stringify({ error: "Notion workspace not set up for this project" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch campaign assets
    const { data: assets } = await adminClient
      .from("campaign_assets")
      .select("*")
      .eq("campaign_id", campaign_id);

    if (!assets || assets.length === 0) {
      return new Response(
        JSON.stringify({ success: true, items_pushed: 0, message: "No assets to push" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const NOTION_TOKEN = Deno.env.get("NOTION_API_KEY");
    if (!NOTION_TOKEN) {
      return new Response(JSON.stringify({ error: "Notion API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const notionHeaders = {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    };

    const demandType =
      campaign.track === "demand_creation"
        ? "Demand Creation (95%)"
        : "Demand Capture (5%)";

    let itemsPushed = 0;

    for (const asset of assets) {
      const properties: Record<string, unknown> = {
        Content: {
          title: [{ text: { content: asset.title } }],
        },
        Status: {
          select: { name: "Brief" },
        },
        Campaign: {
          rich_text: [{ text: { content: campaign.name } }],
        },
        "Demand Type": {
          select: { name: demandType },
        },
      };

      const channel = CHANNEL_MAP[asset.asset_type];
      if (channel) {
        properties.Channel = { select: { name: channel } };
      }

      const contentType = CONTENT_TYPE_MAP[asset.asset_type];
      if (contentType) {
        properties["Content Type"] = { select: { name: contentType } };
      }

      if (asset.publish_date) {
        properties["Publish Date"] = { date: { start: asset.publish_date } };
      }

      try {
        const res = await fetch(`${NOTION_API}/pages`, {
          method: "POST",
          headers: notionHeaders,
          body: JSON.stringify({
            parent: { database_id: project.notion_calendar_db_id },
            properties,
          }),
        });

        if (res.ok) {
          itemsPushed++;
          await res.json();
        } else {
          const errText = await res.text();
          console.error(`Failed to create Notion page for "${asset.title}":`, errText);
        }
      } catch (e) {
        console.error(`Error pushing "${asset.title}" to Notion:`, e);
      }
    }

    return new Response(
      JSON.stringify({ success: true, items_pushed: itemsPushed }),
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
