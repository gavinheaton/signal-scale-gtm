import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const NOTION_API_KEY = Deno.env.get("NOTION_API_KEY")!;
const NOTION_PARENT_PAGE_ID = Deno.env.get("NOTION_CAMPAIGN_BRIEFS_PAGE_ID")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function extractNotionId(input: string): string {
  if (/^[0-9a-f]{8}-/.test(input)) return input;
  const match = input.match(/([0-9a-f]{32})/);
  if (match) {
    const h = match[1];
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  }
  return input;
}

function textBlock(content: string) {
  return {
    object: "block", type: "paragraph",
    paragraph: { rich_text: [{ type: "text", text: { content: content || "" } }] },
  };
}

function heading2(text: string) {
  return {
    object: "block", type: "heading_2",
    heading_2: { rich_text: [{ type: "text", text: { content: text } }] },
  };
}

function divider() {
  return { object: "block", type: "divider", divider: {} };
}

function markdownToBlocks(markdown: string): any[] {
  const blocks: any[] = [];
  for (const line of markdown.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('### ')) {
      blocks.push({ object: "block", type: "heading_3", heading_3: { rich_text: [{ type: "text", text: { content: t.slice(4) } }] } });
    } else if (t.startsWith('## ')) {
      blocks.push({ object: "block", type: "heading_2", heading_2: { rich_text: [{ type: "text", text: { content: t.slice(3) } }] } });
    } else if (t.startsWith('# ')) {
      blocks.push({ object: "block", type: "heading_1", heading_1: { rich_text: [{ type: "text", text: { content: t.slice(2) } }] } });
    } else if (t.startsWith('- ') || t.startsWith('* ')) {
      blocks.push({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ type: "text", text: { content: t.slice(2) } }] } });
    } else {
      blocks.push(textBlock(t));
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
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { campaign_id } = await req.json();
    if (!campaign_id) {
      return new Response(JSON.stringify({ error: "campaign_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch campaign
    const { data: campaign } = await supabase
      .from("campaigns").select("*").eq("id", campaign_id).single();
    if (!campaign) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all assets with content that haven't been pushed yet
    const { data: assets } = await supabase
      .from("campaign_assets")
      .select("*")
      .eq("campaign_id", campaign_id)
      .not("content", "is", null)
      .is("notion_url", null);

    if (!assets || assets.length === 0) {
      return new Response(JSON.stringify({ error: "No assets with content to push" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build a single Notion page with all assets as sections
    const children: any[] = [];
    children.push(textBlock(`Track: ${campaign.track?.replace(/_/g, ' ')} | Status: ${campaign.status} | Assets: ${assets.length}`));
    if (campaign.objective) {
      children.push(heading2("Campaign Objective"));
      children.push(textBlock(campaign.objective));
    }
    children.push(divider());

    for (const asset of assets) {
      children.push(heading2(`${asset.title} — ${asset.asset_type.replace(/_/g, ' ')}`));
      const contentBlocks = markdownToBlocks(asset.content || "");
      // Notion max 100 blocks per request, so limit per asset
      children.push(...contentBlocks.slice(0, 20));
      children.push(divider());
    }

    // Notion limits to 100 children per page creation
    const notionRes = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${NOTION_API_KEY}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parent: { page_id: extractNotionId(NOTION_PARENT_PAGE_ID) },
        properties: {
          title: { title: [{ text: { content: `${campaign.name} — Content Assets` } }] },
        },
        children: children.slice(0, 100),
      }),
    });

    if (!notionRes.ok) {
      const errText = await notionRes.text();
      console.error("Notion API error:", errText);
      let userMessage = "Notion API error";
      try {
        const parsed = JSON.parse(errText);
        if (parsed.code === "object_not_found") {
          userMessage = "The target Notion page is not shared with the Signal2Scale integration. Open the page in Notion → Share → Add the integration.";
        } else if (parsed.code === "unauthorized") {
          userMessage = "The Notion API key is invalid or expired. Check NOTION_API_KEY in Supabase secrets.";
        } else {
          userMessage = parsed.message || userMessage;
        }
      } catch {}
      return new Response(JSON.stringify({ error: userMessage, details: errText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const notionData = await notionRes.json();
    const notionUrl = notionData.url || null;

    // Store notion_url on campaign and all pushed assets
    await supabase
      .from("campaigns")
      .update({ notion_url: notionUrl })
      .eq("id", campaign_id);

    // Mark each asset as pushed
    const assetIds = assets.map(a => a.id);
    await supabase
      .from("campaign_assets")
      .update({ notion_url: notionUrl })
      .in("id", assetIds);

    return new Response(JSON.stringify({ notion_url: notionUrl, assets_pushed: assets.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("bulk-push-campaign-to-notion error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
