import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CAMPAIGN_SYSTEM_PROMPT = Deno.env.get("ANTHROPIC_CAMPAIGN_SYSTEM_PROMPT") || "";

const INITIAL_MESSAGE = "Let's build your campaign strategy. I have your ICP segments and personas loaded — what type of campaign are you looking to create? (e.g. demand capture, demand creation, ABM, product launch)";

/** Deep-merge two objects (shallow per top-level key) */
function mergeDrafts(existing: Record<string, any>, incoming: Record<string, any>): Record<string, any> {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'object' && !Array.isArray(value) && typeof merged[key] === 'object' && !Array.isArray(merged[key])) {
      merged[key] = { ...merged[key], ...value };
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

/** Strip <draft> blocks (well-formed + orphan) and stray ```json fences. */
function stripDraft(text: string): string {
  if (!text) return text;
  let out = text;
  out = out.replace(/<draft>[\s\S]*?<\/draft>/g, "");
  out = out.replace(/<draft>[\s\S]*$/g, "");
  out = out.replace(/```json[\s\S]*?```/g, "");
  out = out.replace(/```json[\s\S]*$/g, "");
  return out.trim();
}

/** Try to parse JSON with cleanup for common LLM issues */
function robustJsonParse(raw: string): Record<string, any> | null {
  try { return JSON.parse(raw); } catch { /* continue */ }
  const cleaned = raw
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .replace(/\n/g, ' ')
    .trim();
  try { return JSON.parse(cleaned); } catch {
    console.error("Failed to parse draft JSON even after cleanup. Raw:", raw.slice(0, 500));
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { message, session_id, project_id, project_context } = await req.json();

    let sessionId = session_id;
    let messages: Array<{ role: string; content: string; timestamp: string }> = [];
    let existingDraft: Record<string, any> = {};
    let storedContext: Record<string, any> = {};

    if (!sessionId) {
      // New session
      const initialMsg = {
        role: "assistant",
        content: INITIAL_MESSAGE,
        timestamp: new Date().toISOString(),
      };
      messages = [initialMsg];

      if (message) {
        messages.push({
          role: "user",
          content: message,
          timestamp: new Date().toISOString(),
        });
      }

      storedContext = project_context || {};

      const { data: session, error: insertError } = await supabase
        .from("wizard_sessions")
        .insert({
          project_id,
          session_type: "campaign",
          messages,
          status: "in_progress",
          context: storedContext,
        })
        .select("id")
        .single();

      if (insertError) {
        return new Response(JSON.stringify({ error: insertError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      sessionId = session.id;

      if (!message) {
        return new Response(
          JSON.stringify({
            reply: INITIAL_MESSAGE,
            updated_draft: {},
            session_id: sessionId,
            notion_url: null,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // Existing session
      const { data: session, error: fetchError } = await supabase
        .from("wizard_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

      if (fetchError || !session) {
        return new Response(JSON.stringify({ error: "Session not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      messages = session.messages as typeof messages;
      existingDraft = (session.draft_output as Record<string, any>) || {};
      storedContext = (session.context as Record<string, any>) || {};
      messages.push({
        role: "user",
        content: message,
        timestamp: new Date().toISOString(),
      });
    }

    // Build system prompt: project context + current draft state + base campaign prompt
    let systemPrompt = "";
    if (storedContext && Object.keys(storedContext).length > 0) {
      systemPrompt += "## PROJECT CONTEXT\n" + JSON.stringify(storedContext) + "\n\n";
    }
    if (Object.keys(existingDraft).length > 0) {
      systemPrompt += "## CURRENT DRAFT STATE\nThis is the campaign draft built so far. Continue building on it, don't restart.\n" + JSON.stringify(existingDraft) + "\n\n";
    }
    systemPrompt += "## DRAFT FORMAT INSTRUCTIONS\nAlways wrap structured output in a <draft> JSON tag. Include a \"sections_complete\" array listing keys for any sections you consider complete: target_audience, campaign_insight, objective, channel_mix, content_calendar, success_metrics. Mark a section complete once you have gathered enough information for it. Example: \"sections_complete\": [\"target_audience\", \"objective\"]\n\nInclude launch_date and end_date (YYYY-MM-DD) in the draft. Derive from the content calendar: launch_date = earliest publish_date minus 7 days prep, end_date = latest publish_date plus 7 days. If the user specifies dates explicitly, use those instead.\n\nEach content_calendar item should include: title, format, persona, week, sequence_order (integer starting at 1), offset_days (days from campaign start), publish_date (YYYY-MM-DD), production_due (YYYY-MM-DD, typically 7 days before publish_date), depends_on (sequence_order of a prerequisite item, or null), rationale (brief explanation of why this content at this point in the journey).\n\nIMPORTANT BREVITY RULES (to avoid response truncation):\n- Keep `rationale` fields under 150 characters.\n- If the calendar would exceed 20 items, group items into phases (e.g. \"Phase 1: Awareness — 5 LinkedIn posts week 1-2\") instead of listing every single item.\n- Keep all draft string values concise; favour short phrases over paragraphs.\n\n";
    systemPrompt += CAMPAIGN_SYSTEM_PROMPT;

    // Sliding window: first 2 messages (context) + last 10 messages (recent conversation)
    const allCleanMessages = messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.role === "assistant" ? stripDraft(m.content) : m.content,
    }));
    const anthropicMessages = allCleanMessages.length <= 12
      ? allCleanMessages
      : [...allCleanMessages.slice(0, 2), ...allCleanMessages.slice(-10)];

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        system: systemPrompt,
        messages: anthropicMessages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Anthropic error:", errorText);
      return new Response(
        JSON.stringify({ error: "AI service error", details: errorText }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const aiData = await response.json();
    const reply = aiData.content?.[0]?.text || "";

    // Extract and merge draft
    let updatedDraft = existingDraft;
    const draftMatch = reply.match(/<draft>([\s\S]*?)<\/draft>/);
    if (draftMatch) {
      const parsed = robustJsonParse(draftMatch[1]);
      if (parsed) {
        updatedDraft = mergeDrafts(existingDraft, parsed);
      } else {
        console.error("Draft parse failed, preserving existing draft");
      }
    }

    let cleanReply = stripDraft(reply);

    // Auto-nudge: if all six sections are complete but is_complete still false,
    // append a clear call-to-action so the user knows how to finalise.
    const REQUIRED_SECTIONS = ["target_audience", "campaign_insight", "objective", "channel_mix", "content_calendar", "success_metrics"];
    const sectionsComplete: string[] = Array.isArray((updatedDraft as any)?.sections_complete)
      ? (updatedDraft as any).sections_complete
      : [];
    const allSectionsDone = REQUIRED_SECTIONS.every(s => sectionsComplete.includes(s));
    const isCompleteFlag = (updatedDraft as any)?.is_complete === true;
    if (allSectionsDone && !isCompleteFlag && !/create campaign/i.test(cleanReply)) {
      cleanReply += "\n\n---\n\n✅ **All six sections look complete.** Reply **\"create campaign\"** to save this brief, generate assets, and push to Notion.";
    }

    // Store the cleaned reply (not the raw one) so resumed sessions never leak
    // truncated/orphan <draft> payloads back into the chat UI.
    messages.push({
      role: "assistant",
      content: cleanReply,
      timestamp: new Date().toISOString(),
    });

    const isComplete = isCompleteFlag;
    const notionBriefReady = (updatedDraft as any)?.notion_brief_ready === true;

    // If complete and notion brief ready, call create-notion-campaign-brief
    let notionUrl: string | null = null;
    if (isComplete && notionBriefReady) {
      try {
        // Extract project/org names from stored context
        const projectName = storedContext?.project_name || "";
        const orgName = storedContext?.org_name || "";

        const notionRes = await fetch(
          `${SUPABASE_URL}/functions/v1/create-notion-campaign-brief`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
              campaign_draft: updatedDraft,
              project_name: projectName,
              org_name: orgName,
            }),
          }
        );
        if (notionRes.ok) {
          const notionData = await notionRes.json();
          notionUrl = notionData.notion_url || null;
        } else {
          console.error("Notion brief creation failed:", await notionRes.text());
        }
      } catch (notionErr) {
        console.error("Notion brief call error:", notionErr);
      }
    }

    await supabase
      .from("wizard_sessions")
      .update({
        messages,
        draft_output: updatedDraft,
        status: isComplete ? "complete" : "in_progress",
        ...(notionUrl ? { notion_url: notionUrl } : {}),
      })
      .eq("id", sessionId);

    return new Response(
      JSON.stringify({
        reply: cleanReply,
        updated_draft: updatedDraft,
        session_id: sessionId,
        notion_url: notionUrl,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("campaign-wizard error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
