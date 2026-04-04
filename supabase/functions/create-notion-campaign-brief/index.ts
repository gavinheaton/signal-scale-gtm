import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";

const NOTION_API = "https://api.notion.com/v1";

function text(content: string) {
  return [{ type: "text", text: { content } }];
}

function extractText(val: unknown): string {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    if (obj.summary) return String(obj.summary);
    if (obj.description) return String(obj.description);
    if (obj.text) return String(obj.text);
    return JSON.stringify(val);
  }
  return String(val);
}

function heading2Block(content: string) {
  return { object: "block", type: "heading_2", heading_2: { rich_text: text(content) } };
}

function paragraphBlock(content: string) {
  return { object: "block", type: "paragraph", paragraph: { rich_text: text(content || "") } };
}

function bulletBlock(content: string) {
  return { object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: text(content) } };
}

function calloutBlock(content: string, emoji = "💬") {
  return {
    object: "block", type: "callout",
    callout: { rich_text: text(content || ""), icon: { type: "emoji", emoji } },
  };
}

const CHANNEL_MAP: Record<string, string> = {
  blog: "Blog", video: "YouTube", podcast: "Podcast",
  linkedin_post: "LinkedIn", linkedin: "LinkedIn",
  email: "Email", webinar: "Blog", whitepaper: "Blog",
  press_release: "PR", tiktok: "TikTok", instagram: "Instagram",
};

const CONTENT_TYPE_MAP: Record<string, string> = {
  blog: "Article", video: "Video", podcast: "Audio",
  linkedin_post: "Post", post: "Post", article: "Article",
  email: "Email", webinar: "Video", whitepaper: "Report",
  press_release: "Article", report: "Report",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const draft = body.campaign_draft || body.draft;
    const projectName = body.project_name || "";
    const orgName = body.org_name || "";
    const projectId = body.project_id || null;

    if (!draft) {
      return new Response(JSON.stringify({ error: "campaign_draft is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    // If project_id provided, route into per-project Content Calendar database
    let notionCalendarDbId: string | null = null;

    if (projectId) {
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const { data: project } = await adminClient
        .from("projects")
        .select("notion_calendar_db_id")
        .eq("id", projectId)
        .single();

      notionCalendarDbId = project?.notion_calendar_db_id || null;
    }

    if (notionCalendarDbId) {
      // ── DATABASE MODE: create individual entries in Content Calendar ──
      const calItems = Array.isArray(draft.content_calendar) ? draft.content_calendar : [];
      const campaignName = draft.campaign_name || "Untitled Campaign";
      const demandTypeDefault = draft.track === "demand_capture"
        ? "Demand Capture (5%)"
        : "Demand Creation (95%)";

      let itemsPushed = 0;

      // 1. Create a Campaign Brief summary entry
      const briefBody: unknown[] = [];
      if (orgName || projectName) {
        briefBody.push(paragraphBlock(`${orgName}${orgName && projectName ? " — " : ""}${projectName}`));
      }
      briefBody.push(heading2Block("The Insight"));
      briefBody.push(paragraphBlock(extractText(draft.campaign_insight)));
      briefBody.push(heading2Block("Campaign Objective"));
      briefBody.push(paragraphBlock(extractText(draft.objective)));
      briefBody.push(heading2Block("Key Message"));
      briefBody.push(calloutBlock(extractText(draft.key_message || draft.objective?.key_message || "")));

      if (draft.success_metrics && typeof draft.success_metrics === "object") {
        briefBody.push(heading2Block("Success Metrics"));
        const metrics = draft.success_metrics as Record<string, unknown>;
        if (metrics.primary) briefBody.push(calloutBlock(`Primary: ${extractText(metrics.primary)}`, "🎯"));
        if (metrics.secondary) briefBody.push(calloutBlock(`Secondary: ${extractText(metrics.secondary)}`, "📈"));
      }

      const antiPatterns = Array.isArray(draft.anti_patterns) ? draft.anti_patterns : [];
      if (antiPatterns.length > 0) {
        briefBody.push(heading2Block("What to Avoid"));
        for (const ap of antiPatterns) {
          briefBody.push(bulletBlock(typeof ap === "string" ? ap : JSON.stringify(ap)));
        }
      }

      try {
        const briefRes = await fetch(`${NOTION_API}/pages`, {
          method: "POST",
          headers: notionHeaders,
          body: JSON.stringify({
            parent: { database_id: notionCalendarDbId },
            properties: {
              Content: { title: text(`${campaignName} — Campaign Brief`) },
              Status: { select: { name: "Brief" } },
              Campaign: { rich_text: text(campaignName) },
              "Content Type": { select: { name: "Report" } },
              "Demand Type": { select: { name: demandTypeDefault } },
              "Publish Date": { date: { start: new Date().toISOString().split("T")[0] } },
            },
            children: briefBody.slice(0, 100),
          }),
        });
        if (briefRes.ok) itemsPushed++;
        else console.error("Failed to create brief entry:", await briefRes.text());
      } catch (e) {
        console.error("Error creating brief entry:", e);
      }

      // 2. Create individual entries for each content calendar item
      for (const item of calItems) {
        const properties: Record<string, unknown> = {
          Content: { title: text(item.title || "Untitled") },
          Status: { select: { name: "Brief" } },
          Campaign: { rich_text: text(campaignName) },
        };

        // Channel
        const rawChannel = (item.format || item.channel || "").toLowerCase().replace(/[\s-]/g, "_");
        const channel = CHANNEL_MAP[rawChannel];
        if (channel) properties.Channel = { select: { name: channel } };

        // Content Type
        const rawType = (item.content_type || item.format || "").toLowerCase().replace(/[\s-]/g, "_");
        const contentType = CONTENT_TYPE_MAP[rawType];
        if (contentType) properties["Content Type"] = { select: { name: contentType } };

        // Demand Type from track or item
        const trackVal = item.track || draft.track || "";
        const demandType = trackVal === "demand_capture"
          ? "Demand Capture (5%)"
          : "Demand Creation (95%)";
        properties["Demand Type"] = { select: { name: demandType } };

        // Dates — always set to anchor on the Notion calendar
        const today = new Date().toISOString().split("T")[0];
        properties["Publish Date"] = { date: { start: item.publish_date || item.week || today } };

        // Persona
        if (item.persona) {
          properties.Persona = { rich_text: text(item.persona) };
        }

        // Purpose as page body
        const children: unknown[] = [];
        if (item.purpose) {
          children.push(paragraphBlock(item.purpose));
        }

        try {
          const res = await fetch(`${NOTION_API}/pages`, {
            method: "POST",
            headers: notionHeaders,
            body: JSON.stringify({
              parent: { database_id: notionCalendarDbId },
              properties,
              children,
            }),
          });
          if (res.ok) itemsPushed++;
          else console.error(`Failed to create "${item.title}":`, await res.text());
        } catch (e) {
          console.error(`Error creating "${item.title}":`, e);
        }
      }

      // Update last synced timestamp
      if (projectId) {
        const adminClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        await adminClient
          .from("projects")
          .update({ notion_last_synced_at: new Date().toISOString() })
          .eq("id", projectId);
      }

      const calendarUrl = `https://notion.so/${notionCalendarDbId.replace(/-/g, "")}`;
      return new Response(JSON.stringify({ notion_url: calendarUrl, items_pushed: itemsPushed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── FALLBACK: legacy page-based creation (no project_id or no calendar DB) ──
    const PARENT_PAGE_ID = Deno.env.get("NOTION_CAMPAIGN_BRIEFS_PAGE_ID");
    if (!PARENT_PAGE_ID) {
      return new Response(JSON.stringify({ error: "No Notion workspace configured. Provide project_id or set NOTION_CAMPAIGN_BRIEFS_PAGE_ID." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    function extractNotionId(input: string): string {
      if (/^[0-9a-f]{8}-/.test(input)) return input;
      const match = input.match(/([0-9a-f]{32})/);
      if (match) {
        const h = match[1];
        return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
      }
      return input;
    }

    const parentPageId = extractNotionId(PARENT_PAGE_ID);

    // Build children blocks (legacy)
    const children: Record<string, unknown>[] = [];

    if (orgName || projectName) {
      children.push(paragraphBlock(`${orgName}${orgName && projectName ? " — " : ""}${projectName}`));
    }
    children.push(heading2Block("The Insight"));
    children.push(paragraphBlock(extractText(draft.campaign_insight)));
    children.push(heading2Block("Campaign Objective"));
    children.push(paragraphBlock(extractText(draft.objective)));
    children.push(heading2Block("Key Message"));
    children.push(calloutBlock(extractText(draft.key_message || draft.objective?.key_message || "")));

    // Channel Plan
    children.push(heading2Block("Channel Plan"));
    if (draft.channel_mix && typeof draft.channel_mix === "object") {
      const channels = Array.isArray(draft.channel_mix)
        ? draft.channel_mix
        : Object.entries(draft.channel_mix).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);
      for (const ch of channels) {
        children.push(bulletBlock(typeof ch === "string" ? ch : JSON.stringify(ch)));
      }
    } else {
      children.push(paragraphBlock("No channels specified."));
    }

    // Success Metrics
    children.push(heading2Block("Success Metrics"));
    if (draft.success_metrics && typeof draft.success_metrics === "object") {
      const metrics = draft.success_metrics as Record<string, unknown>;
      if (metrics.primary) children.push(calloutBlock(`Primary: ${extractText(metrics.primary)}`, "🎯"));
      if (metrics.secondary) children.push(calloutBlock(`Secondary: ${extractText(metrics.secondary)}`, "📈"));
    } else {
      children.push(paragraphBlock("No metrics defined."));
    }

    // What to Avoid
    const antiPatterns = Array.isArray(draft.anti_patterns) ? draft.anti_patterns : [];
    if (antiPatterns.length > 0) {
      children.push(heading2Block("What to Avoid"));
      for (const ap of antiPatterns) {
        children.push(bulletBlock(typeof ap === "string" ? ap : JSON.stringify(ap)));
      }
    }

    const notionRes = await fetch(`${NOTION_API}/pages`, {
      method: "POST",
      headers: notionHeaders,
      body: JSON.stringify({
        parent: { page_id: parentPageId },
        properties: {
          title: { title: text(draft.campaign_name || "Untitled Campaign") },
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
          userMessage = "The target Notion page is not shared with the integration.";
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
    return new Response(JSON.stringify({ notion_url: notionData.url || null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("create-notion-campaign-brief error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
