import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PERSONA_SYSTEM_PROMPT = `You are an expert B2B buyer persona strategist following the Disruptors Handbook methodology. You help create detailed buyer personas that drive better product and marketing decisions.

Your job is to guide the user through building a comprehensive buyer persona through structured conversation. Each persona must cover these elements:

1. **Persona Name & Role** — A memorable archetype name (e.g. "The Visionary CMO") and their role in the buying process (Champion, Economic Buyer, Influencer, End User, or Blocker)
2. **Organisational Context** — Sector, team function, mandates, strategic priorities, company stage
3. **Goals** — What success looks like for them (personal vs organisational), what they're measured on
4. **Pain Points** — What blocks progress, internal/external constraints, frustrations
5. **Buying Behaviour** — Buying triggers, who else is involved in evaluating vendors, what makes them say yes or no, evaluation criteria, typical sales cycle
6. **Channel Preferences & Evidence** — Where they find information, what evidence moves the needle (data, peer proof, pilot results, exec buy-in), content formats they prefer
7. **AI & Innovation Readiness** — Their attitude toward emerging tech, early adopter vs laggard, experimentation history (score 1-5)
8. **How We Help** — Services/offers that solve the persona's challenge, message cues and tone

IMPORTANT CONTEXT:
- You are building a persona linked to a specific ICP segment. The ICP data will be provided to you — use it to inform your persona questions.
- Your draft JSON output is AUTOMATICALLY saved to the database after every single exchange. The user can see it updating live.
- When all sections have substantive content, set is_complete to true. Tell the user: "Your persona is ready — click **Save to Platform** on the right panel to save it."

INSTRUCTIONS:
- Ask ONE focused question at a time.
- Be conversational and consultative, drawing from the ICP context to ask smarter questions.
- After each exchange, summarise what you've captured for the current section before moving on.
- Use the interview question framework: Role & Context → Challenges & Motivations → Buying Behaviour → Innovation Readiness → Channel Preferences.

After EVERY response, you MUST output a JSON block wrapped in <draft> tags:
<draft>
{
  "persona_name": "The [Archetype] [Role]",
  "role_in_buying": null or "champion"|"economic_buyer"|"influencer"|"end_user"|"blocker",
  "organisational_context": { ... },
  "goals": { ... },
  "pain_points": { ... },
  "buying_behaviour": { ... },
  "channel_preferences": { ... },
  "preferred_evidence": { ... },
  "ai_readiness_score": null or 1-5,
  "how_we_help": "",
  "sections_complete": ["persona_name", ...list of sections with substantive content...],
  "is_complete": false
}
</draft>

CRITICAL JSON RULES:
- Output valid JSON only inside <draft> tags. No trailing commas, no comments.
- Always include ALL keys even if empty (use {} or "" or null for empty values).
- Set is_complete to true ONLY when all sections have substantive, actionable content.`;

const PERSONA_SECTIONS = [
  'persona_name', 'organisational_context', 'goals', 'pain_points',
  'buying_behaviour', 'channel_preferences', 'how_we_help'
];

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
    console.error("Failed to parse persona draft JSON. Raw:", raw.slice(0, 500));
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

    const { message, session_id, project_id, icp_id } = await req.json();

    let sessionId = session_id;
    let messages: Array<{ role: string; content: string; timestamp: string }> = [];
    let existingDraft: Record<string, any> = {};

    // Fetch ICP data, existing personas, and brand context
    let icpContext = "";
    let coveredRoles: string[] = [];
    let missingRoles: string[] = [];
    const ALL_BUYING_ROLES = ["champion", "economic_buyer", "influencer", "end_user", "blocker"];

    if (icp_id) {
      const [{ data: icpData }, { data: existingPersonas }] = await Promise.all([
        supabase.from("icps").select("*").eq("id", icp_id).single(),
        supabase.from("personas").select("persona_name, role_in_buying").eq("icp_id", icp_id).eq("is_current", true),
      ]);
      if (icpData) {
        icpContext = `\n\nICP CONTEXT (use this to inform your persona questions):\n- Segment: ${icpData.segment_name}\n- Matrix Category: ${icpData.matrix_category}\n- Fit Score: ${icpData.fit_score}/10, Access Score: ${icpData.access_score}/10\n- Firmographics: ${JSON.stringify(icpData.firmographics)}\n- Psychographics: ${JSON.stringify(icpData.psychographics)}\n- Buyer Roles: ${JSON.stringify(icpData.buyer_roles)}\n- Anti-ICP Signals: ${JSON.stringify(icpData.anti_icp_signals)}`;
      }
      if (existingPersonas && existingPersonas.length > 0) {
        coveredRoles = existingPersonas.map((p: any) => p.role_in_buying);
        const coveredList = existingPersonas.map((p: any) => `  - ${p.persona_name} (${p.role_in_buying.replace('_', ' ')})`).join("\n");
        icpContext += `\n\nEXISTING PERSONAS FOR THIS ICP:\n${coveredList}`;
      }
      missingRoles = ALL_BUYING_ROLES.filter(r => !coveredRoles.includes(r));
      if (missingRoles.length > 0) {
        icpContext += `\n\nUNCOVERED BUYING ROLES: ${missingRoles.map(r => r.replace('_', ' ')).join(', ')}\nYou should suggest the user builds a persona/influence for one of these uncovered roles. Explain why that role matters for this specific ICP segment.`;
      } else {
        icpContext += `\n\nALL 5 BUYING ROLES ARE COVERED for this ICP. The user may want to add an additional influence (process, policy, reporting line) or refine an existing one.`;
      }
    }

    // Load brand context from the project
    let brandContextStr = "";
    if (project_id) {
      const { data: project } = await supabase
        .from("projects")
        .select("brand_context")
        .eq("id", project_id)
        .single();
      const bc = project?.brand_context as Record<string, any> | null;
      if (bc?.crawled_content && bc.crawled_content.length > 0) {
        brandContextStr = `\n\nBRAND CONTEXT (from previous analysis of ${bc.website_url || "company website"}):\n${bc.crawled_content}\n\nUse this to inform your persona questions alongside the ICP context.`;
      }
    }

    const initialMessage = icp_id
      ? "Great, let's build a buyer persona for this ICP segment. I've loaded the ICP context. Let's start — what role or title does the key buyer you want to map have? Are they a decision-maker, influencer, champion, or blocker in the buying process?"
      : "Let's build a buyer persona. What role or job title does the person you want to map have? And what's their role in the buying process — are they a champion, decision-maker, influencer, end user, or blocker?";

    if (!sessionId) {
      const initialMsg = {
        role: "assistant",
        content: initialMessage,
        timestamp: new Date().toISOString(),
      };
      messages = [initialMsg];

      if (message) {
        messages.push({ role: "user", content: message, timestamp: new Date().toISOString() });
      }

      const { data: session, error: insertError } = await supabase
        .from("wizard_sessions")
        .insert({
          project_id,
          session_type: "persona",
          messages,
          status: "in_progress",
        })
        .select("id")
        .single();

      if (insertError) {
        return new Response(JSON.stringify({ error: insertError.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      sessionId = session.id;

      if (!message) {
        return new Response(
          JSON.stringify({ reply: initialMessage, updated_draft: {}, session_id: sessionId }),
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
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      messages = session.messages as typeof messages;
      existingDraft = (session.draft_output as Record<string, any>) || {};
      messages.push({ role: "user", content: message, timestamp: new Date().toISOString() });
    }

    // Build Anthropic messages
    const anthropicMessages = messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.role === "assistant"
        ? m.content.replace(/<draft>[\s\S]*?<\/draft>/g, "").trim()
        : m.content,
    }));

    const systemPrompt = PERSONA_SYSTEM_PROMPT + icpContext + brandContextStr;

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
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await response.json();
    const reply = aiData.content?.[0]?.text || "";

    let updatedDraft = existingDraft;
    const draftMatch = reply.match(/<draft>([\s\S]*?)<\/draft>/);
    if (draftMatch) {
      const parsed = robustJsonParse(draftMatch[1]);
      if (parsed) {
        updatedDraft = mergeDrafts(existingDraft, parsed);
      }
    }

    const cleanReply = reply.replace(/<draft>[\s\S]*?<\/draft>/, "").trim();

    messages.push({ role: "assistant", content: reply, timestamp: new Date().toISOString() });

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
      JSON.stringify({ reply: cleanReply, updated_draft: updatedDraft, session_id: sessionId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("persona-wizard error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
