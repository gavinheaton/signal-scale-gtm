import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ICP_SYSTEM_PROMPT = `You are an expert B2B go-to-market strategist specialising in Ideal Customer Profile (ICP) development for deep-tech and B2B SaaS companies. You follow the DH26 ICP framework with 6 core elements.

Your job is to guide the user through building a comprehensive ICP by having a structured conversation. You must fill in ALL 6 sections of the ICP:

1. **Firmographics** — Industry/vertical, company size (employees & revenue), geography, growth stage, tech stack indicators
2. **Psychographics** — Organisational values, risk tolerance, innovation appetite, buying culture (consensus vs top-down), budget philosophy
3. **Operational Readiness** — Current tech maturity, team structure, existing solutions/tools, integration requirements, change management capacity
4. **Alignment & Urgency** — Strategic priorities aligning with our solution, regulatory/compliance drivers, competitive pressure, timeline pressures, budget cycle timing
5. **Key Buyer Roles & Behaviour** — Decision makers (titles/roles), buying committee structure, champion profile, evaluation criteria, typical sales cycle length
6. **Anti-ICP Signals** — Red flags indicating poor fit: wrong stage, misaligned expectations, budget mismatch, cultural mismatch, technical incompatibility

IMPORTANT CONTEXT — SAVING & PERSISTENCE:
- Your draft JSON output is AUTOMATICALLY saved to the database after every single exchange. The user can see it updating live in the right-hand preview panel.
- You DO have the ability to save — every response you give persists the draft data automatically.
- When all 6 sections have substantive content, set is_complete to true. The user will then see a "Save to Platform" button light up on the right panel. Tell them: "Your ICP is ready — click **Save to Platform** on the right panel to save it."
- The user can also save partial progress at any time using the "Save Draft" button.

INSTRUCTIONS:
- When a website URL is provided, the page content will be fetched and included in your context. Analyse it thoroughly and map every finding to the relevant ICP section before asking questions.
- Ask ONE focused question at a time to fill gaps in each element.
- After each exchange, mentally track which sections are filled and which need more information.
- When you have enough information for a section, summarise what you've captured for that section.
- Be conversational and consultative, not robotic.

After EVERY response, you MUST output a JSON block at the very end of your message wrapped in <draft> tags like this:
<draft>
{
  "firmographics": { ... },
  "psychographics": { ... },
  "operational_readiness": { ... },
  "alignment_urgency": { ... },
  "buyer_roles_behaviour": { ... },
  "anti_icp_signals": { ... },
  "segment_name": "suggested name or empty string",
  "fit_score": null or 1-10,
  "access_score": null or 1-10,
  "matrix_category": null or "now_account"|"strategic_nurture"|"trap_account"|"no_go",
  "sections_complete": ["firmographics", ...list of sections with substantive content...],
  "is_complete": false
}
</draft>

CRITICAL JSON RULES:
- Output valid JSON only inside <draft> tags. No trailing commas, no comments, no JavaScript syntax.
- Always include ALL 6 section keys even if empty (use {} for empty sections).
- Set is_complete to true ONLY when all 6 sections have substantive, actionable content.
- When marking complete, also fill in segment_name, fit_score, access_score, and matrix_category.

The user sees the draft card update in real-time, so keep the JSON accurate and progressive.`;

const INITIAL_MESSAGE = "Let's build your ICP. I'll start by researching your company — what's your website URL? If you have existing customers, personas, or messaging you'd like me to work from, you can share those too.";

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
  // First try direct parse
  try {
    return JSON.parse(raw);
  } catch { /* continue */ }

  // Clean up common issues
  let cleaned = raw
    .replace(/,\s*([}\]])/g, '$1')        // trailing commas
    .replace(/\/\/[^\n]*/g, '')            // JS single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '')      // JS block comments
    .replace(/[\x00-\x1F\x7F]/g, ' ')     // control characters (except via \n etc in strings)
    .replace(/\n/g, ' ')                   // newlines
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
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

    const { message, session_id, project_id } = await req.json();

    let sessionId = session_id;
    let messages: Array<{ role: string; content: string; timestamp: string }> = [];
    let existingDraft: Record<string, any> = {};

    if (!sessionId) {
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

      const { data: session, error: insertError } = await supabase
        .from("wizard_sessions")
        .insert({
          project_id,
          session_type: "icp",
          messages,
          status: "in_progress",
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
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
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
      messages.push({
        role: "user",
        content: message,
        timestamp: new Date().toISOString(),
      });
    }

    // Detect URLs and fetch content (trimmed to 4000 chars)
    const lastUserMsg = messages[messages.length - 1];
    let enrichedContent = lastUserMsg.content;
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
    const urls = lastUserMsg.role === "user" ? lastUserMsg.content.match(urlRegex) : null;

    if (urls && urls.length > 0) {
      for (const url of urls.slice(0, 2)) {
        try {
          console.log("Fetching URL:", url);
          const fetchRes = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; ICPWizardBot/1.0)" },
            redirect: "follow",
          });
          if (fetchRes.ok) {
            let html = await fetchRes.text();
            html = html.replace(/<script[\s\S]*?<\/script>/gi, "");
            html = html.replace(/<style[\s\S]*?<\/style>/gi, "");
            html = html.replace(/<[^>]+>/g, " ");
            html = html.replace(/\s+/g, " ").trim();
            const cleaned = html.slice(0, 4000);
            enrichedContent += `\n\n[Fetched content from ${url}]:\n${cleaned}`;
          } else {
            enrichedContent += `\n\n[Failed to fetch ${url}: HTTP ${fetchRes.status}]`;
            await fetchRes.text();
          }
        } catch (fetchErr) {
          console.error("URL fetch error:", fetchErr);
          enrichedContent += `\n\n[Failed to fetch ${url}: ${fetchErr instanceof Error ? fetchErr.message : "unknown error"}]`;
        }
      }
      messages[messages.length - 1] = { ...lastUserMsg, content: enrichedContent };
    }

    // Build Anthropic messages — strip draft tags from prior assistant messages to save tokens
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
        system: ICP_SYSTEM_PROMPT,
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

    await supabase
      .from("wizard_sessions")
      .update({
        messages,
        draft_output: updatedDraft,
        status: isComplete ? "complete" : "in_progress",
      })
      .eq("id", sessionId);

    return new Response(
      JSON.stringify({
        reply: cleanReply,
        updated_draft: updatedDraft,
        session_id: sessionId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("icp-wizard error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
