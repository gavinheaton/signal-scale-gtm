import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const NOTION_API_KEY = Deno.env.get("NOTION_API_KEY")!;
const NOTION_PARENT_PAGE_ID = Deno.env.get("NOTION_CAMPAIGN_BRIEFS_PAGE_ID")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function markdownToNotionBlocks(markdown: string): any[] {
  const blocks: any[] = [];
  const lines = markdown.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('### ')) {
      blocks.push({
        object: "block", type: "heading_3",
        heading_3: { rich_text: [{ type: "text", text: { content: trimmed.slice(4) } }] },
      });
    } else if (trimmed.startsWith('## ')) {
      blocks.push({
        object: "block", type: "heading_2",
        heading_2: { rich_text: [{ type: "text", text: { content: trimmed.slice(3) } }] },
      });
    } else if (trimmed.startsWith('# ')) {
      blocks.push({
        object: "block", type: "heading_1",
        heading_1: { rich_text: [{ type: "text", text: { content: trimmed.slice(2) } }] },
      });
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      blocks.push({
        object: "block", type: "bulleted_list_item",
        bulleted_list_item: { rich_text: [{ type: "text", text: { content: trimmed.slice(2) } }] },
      });
    } else if (/^\d+\.\s/.test(trimmed)) {
      blocks.push({
        object: "block", type: "numbered_list_item",
        numbered_list_item: { rich_text: [{ type: "text", text: { content: trimmed.replace(/^\d+\.\s/, '') } }] },
      });
    } else {
      blocks.push({
        object: "block", type: "paragraph",
        paragraph: { rich_text: [{ type: "text", text: { content: trimmed } }] },
      });
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

    const { asset_id, parent_page_id } = await req.json();
    if (!asset_id) {
      return new Response(JSON.stringify({ error: "asset_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: asset } = await supabase
      .from("campaign_assets").select("*").eq("id", asset_id).single();
    if (!asset || !asset.content) {
      return new Response(JSON.stringify({ error: "Asset has no content" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contentBlocks = markdownToNotionBlocks(asset.content);

    // Notion limits to 100 blocks per request
    const children = contentBlocks.slice(0, 100);

    const notionRes = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${NOTION_API_KEY}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parent: { page_id: parent_page_id || NOTION_PARENT_PAGE_ID },
        properties: {
          title: { title: [{ text: { content: `${asset.title} (${asset.asset_type.replace(/_/g, ' ')})` } }] },
        },
        children,
      }),
    });

    if (!notionRes.ok) {
      const errText = await notionRes.text();
      console.error("Notion API error:", errText);
      return new Response(JSON.stringify({ error: "Notion API error", details: errText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const notionData = await notionRes.json();
    const notionUrl = notionData.url || null;

    // Update asset with notion URL
    await supabase
      .from("campaign_assets")
      .update({ notion_url: notionUrl })
      .eq("id", asset_id);

    return new Response(JSON.stringify({ notion_url: notionUrl, asset_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("push-asset-to-notion error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
