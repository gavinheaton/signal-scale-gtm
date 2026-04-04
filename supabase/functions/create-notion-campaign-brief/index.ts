const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const NOTION_API_KEY = Deno.env.get("NOTION_API_KEY")!;
const NOTION_PARENT_PAGE_ID_RAW = Deno.env.get("NOTION_CAMPAIGN_BRIEFS_PAGE_ID")!;

function extractNotionId(input: string): string {
  if (/^[0-9a-f]{8}-/.test(input)) return input;
  const match = input.match(/([0-9a-f]{32})/);
  if (match) {
    const h = match[1];
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  }
  return input;
}

const NOTION_PARENT_PAGE_ID = extractNotionId(NOTION_PARENT_PAGE_ID_RAW);

function textBlock(content: string) {
  return {
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [{ type: "text", text: { content: content || "" } }],
    },
  };
}

function heading2(text: string) {
  return {
    object: "block",
    type: "heading_2",
    heading_2: {
      rich_text: [{ type: "text", text: { content: text } }],
    },
  };
}

function bulletItem(text: string) {
  return {
    object: "block",
    type: "bulleted_list_item",
    bulleted_list_item: {
      rich_text: [{ type: "text", text: { content: text } }],
    },
  };
}

function calloutBlock(text: string, emoji = "💬") {
  return {
    object: "block",
    type: "callout",
    callout: {
      rich_text: [{ type: "text", text: { content: text || "" } }],
      icon: { type: "emoji", emoji },
    },
  };
}

function tableRow(cells: string[]) {
  return {
    type: "table_row",
    table_row: {
      cells: cells.map(c => [{ type: "text", text: { content: c || "" } }]),
    },
  };
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const draft = body.campaign_draft || body.draft;
    const projectName = body.project_name || "";
    const orgName = body.org_name || "";

    if (!draft) {
      return new Response(JSON.stringify({ error: "campaign_draft is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build children blocks
    const children: Record<string, unknown>[] = [];

    // Subtitle
    if (orgName || projectName) {
      children.push(textBlock(`${orgName}${orgName && projectName ? " — " : ""}${projectName}`));
    }

    // The Insight
    children.push(heading2("The Insight"));
    children.push(textBlock(extractText(draft.campaign_insight)));

    // Campaign Objective
    children.push(heading2("Campaign Objective"));
    children.push(textBlock(extractText(draft.objective)));

    // Key Message
    children.push(heading2("Key Message"));
    children.push(calloutBlock(extractText(draft.key_message || draft.objective?.key_message || "")));

    // Channel Plan
    children.push(heading2("Channel Plan"));
    if (draft.channel_mix && typeof draft.channel_mix === "object") {
      const channels = Array.isArray(draft.channel_mix)
        ? draft.channel_mix
        : Object.entries(draft.channel_mix).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
      for (const ch of channels) {
        children.push(bulletItem(typeof ch === "string" ? ch : JSON.stringify(ch)));
      }
    } else {
      children.push(textBlock("No channels specified."));
    }

    // Content Calendar (table — max 100 rows due to Notion limits)
    children.push(heading2("Content Calendar"));
    const calItems = Array.isArray(draft.content_calendar) ? draft.content_calendar : [];
    if (calItems.length > 0) {
      const rows = [
        tableRow(["Title", "Format", "Persona", "Track", "Week", "Purpose"]),
        ...calItems.slice(0, 99).map((item: Record<string, string>) =>
          tableRow([
            item.title || "",
            item.format || "",
            item.persona || "",
            item.track || "",
            item.week || "",
            item.purpose || "",
          ])
        ),
      ];
      children.push({
        object: "block",
        type: "table",
        table: {
          table_width: 6,
          has_column_header: true,
          has_row_header: false,
          children: rows,
        },
      });
    } else {
      children.push(textBlock("No content calendar items."));
    }

    // Success Metrics
    children.push(heading2("Success Metrics"));
    if (draft.success_metrics && typeof draft.success_metrics === "object") {
      const metrics = draft.success_metrics as Record<string, unknown>;
      if (metrics.primary) {
        children.push(calloutBlock(`Primary: ${extractText(metrics.primary)}`, "🎯"));
      }
      if (metrics.secondary) {
        children.push(calloutBlock(`Secondary: ${extractText(metrics.secondary)}`, "📈"));
      }
      if (!metrics.primary && !metrics.secondary) {
        children.push(textBlock(extractText(draft.success_metrics)));
      }
    } else {
      children.push(textBlock("No metrics defined."));
    }

    // 95-5 Balance
    children.push(heading2("95-5 Balance"));
    const dcCount = calItems.filter((i: Record<string, string>) => i.track === "demand_capture").length;
    const total = calItems.length || 1;
    const capturePct = Math.round((dcCount / total) * 100);
    const creationPct = 100 - capturePct;
    children.push(textBlock(`Demand Creation: ${creationPct}% | Demand Capture: ${capturePct}%`));

    // What to Avoid
    children.push(heading2("What to Avoid"));
    const antiPatterns = Array.isArray(draft.anti_patterns) ? draft.anti_patterns : [];
    if (antiPatterns.length > 0) {
      for (const ap of antiPatterns) {
        children.push(bulletItem(typeof ap === "string" ? ap : JSON.stringify(ap)));
      }
    } else {
      children.push(textBlock("No anti-patterns specified."));
    }

    // Create Notion page
    const notionPayload = {
      parent: { page_id: NOTION_PARENT_PAGE_ID },
      properties: {
        title: {
          title: [{ text: { content: draft.campaign_name || "Untitled Campaign" } }],
        },
      },
      children,
    };

    const notionRes = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${NOTION_API_KEY}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(notionPayload),
    });

    if (!notionRes.ok) {
      const errText = await notionRes.text();
      console.error("Notion API error:", errText);
      return new Response(JSON.stringify({ error: "Notion API error", details: errText }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const notionData = await notionRes.json();
    const notionUrl = notionData.url || null;

    return new Response(JSON.stringify({ notion_url: notionUrl }), {
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
