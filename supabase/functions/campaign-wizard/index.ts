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

    // Build system prompt: project context + base campaign prompt
    let systemPrompt = "";
    if (storedContext && Object.keys(storedContext).length > 0) {
      systemPrompt += "## PROJECT CONTEXT\n" + JSON.stringify(storedContext) + "\n\n";
    }
    systemPrompt += CAMPAIGN_SYSTEM_PROMPT;

    // Build Anthropic messages — strip draft tags from prior assistant messages
    const anthropicMessages = messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.role === "assistant"
        ? m.content.replace(/<draft>[\s\S]*?<\/draft>/g, "").trim()
        : m.content,
    }));

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
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

    const cleanReply = reply.replace(/<draft>[\s\S]*?<\/draft>/, "").trim();

    messages.push({
      role: "assistant",
      content: reply,
      timestamp: new Date().toISOString(),
    });

    const isComplete = (updatedDraft as any)?.is_complete === true;
    const notionBriefReady = (updatedDraft as any)?.notion_brief_ready === true;

    // If complete and notion brief ready, call create-notion-campaign-brief
    let notionUrl: string | null = null;
    if (isComplete && notionBriefReady) {
      try {
        const notionRes = await fetch(
          `${SUPABASE_URL}/functions/v1/create-notion-campaign-brief`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
              session_id: sessionId,
              project_id,
              draft: updatedDraft,
              context: storedContext,
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
