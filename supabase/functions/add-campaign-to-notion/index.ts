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

    // Fix: use getUser instead of getClaims
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

    // Fetch campaign with project info
    const { data: campaign, error: campErr } = await adminClient
      .from("campaigns")
      .select("id, name, track, project_id, objective, target_icp_ids")
      .eq("id", campaign_id)
      .single();

    if (campErr || !campaign) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get project's Notion database IDs
    const { data: project } = await adminClient
      .from("projects")
      .select("notion_calendar_db_id, notion_foundations_db_id")
      .eq("id", campaign.project_id)
      .single();

    if (!project?.notion_calendar_db_id) {
      return new Response(
        JSON.stringify({ error: "Notion workspace not set up for this project" }),
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

    const demandType =
      campaign.track === "demand_creation"
        ? "Demand Creation (95%)"
        : "Demand Capture (5%)";

    // ── Seed Foundations database (if available) ──
    if (project.notion_foundations_db_id) {
      // Seed personas as Audience foundation pages
      if (campaign.target_icp_ids && campaign.target_icp_ids.length > 0) {
        const { data: personas } = await adminClient
          .from("personas")
          .select("persona_name")
          .in("icp_id", campaign.target_icp_ids);

        if (personas && personas.length > 0) {
          for (const persona of personas) {
            try {
              await fetch(`${NOTION_API}/pages`, {
                method: "POST",
                headers: notionHeaders,
                body: JSON.stringify({
                  parent: { database_id: project.notion_foundations_db_id },
                  properties: {
                    Foundation: { title: text(persona.persona_name) },
                    Type: { select: { name: "Audience" } },
                    Detail: { rich_text: text(`Persona from campaign: ${campaign.name}`) },
                  },
                }),
              });
            } catch (e) {
              console.error(`Failed to seed persona foundation "${persona.persona_name}":`, e);
            }
          }
        }
      }

      // Seed Growth Goal from campaign objective
      if (campaign.objective) {
        try {
          await fetch(`${NOTION_API}/pages`, {
            method: "POST",
            headers: notionHeaders,
            body: JSON.stringify({
              parent: { database_id: project.notion_foundations_db_id },
              properties: {
                Foundation: { title: text(`Growth Goal: ${campaign.name}`) },
                Type: { select: { name: "Growth Goal" } },
                Detail: { rich_text: text(campaign.objective) },
              },
            }),
          });
        } catch (e) {
          console.error("Failed to seed growth goal foundation:", e);
        }
      }
    }

    // ── Push campaign assets to Content Calendar ──
    const { data: assets } = await adminClient
      .from("campaign_assets")
      .select("*")
      .eq("campaign_id", campaign_id)
      .is("notion_url", null);

    if (!assets || assets.length === 0) {
      return new Response(
        JSON.stringify({ success: true, items_pushed: 0, message: "No assets to push" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let itemsPushed = 0;

    for (const asset of assets) {
      const properties: Record<string, unknown> = {
        Content: { title: text(asset.title) },
        Status: { select: { name: "Brief" } },
        Campaign: { rich_text: text(campaign.name) },
        "Demand Type": { select: { name: demandType } },
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

      // Pillar left blank — user assigns manually

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
          console.error(`Failed to create Notion page for "${asset.title}":`, errText);
        }
      } catch (e) {
        console.error(`Error pushing "${asset.title}" to Notion:`, e);
      }
    }

    // Update last synced timestamp
    await adminClient
      .from("projects")
      .update({ notion_last_synced_at: new Date().toISOString() })
      .eq("id", campaign.project_id);

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
