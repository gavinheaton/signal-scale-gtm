import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getActivePrompt } from "../_shared/promptTemplates.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export { PERSONA_SYSTEM_PROMPT } from "../_shared/defaultPrompts.ts";
import { PERSONA_SYSTEM_PROMPT } from "../_shared/defaultPrompts.ts";

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
  try { return JSON.parse(cleaned); } catch { /* continue */ }

  // Truncation-tolerant fallback
  let candidate = cleaned;
  for (let attempt = 0; attempt < 200; attempt++) {
    const lastSafe = Math.max(candidate.lastIndexOf(','), candidate.lastIndexOf('{'), candidate.lastIndexOf('['));
    if (lastSafe < 0) break;
    candidate = candidate.slice(0, lastSafe).replace(/[,\s]+$/, '');
    let opens = 0, closes = 0, openSq = 0, closeSq = 0, inStr = false, esc = false;
    for (const ch of candidate) {
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') opens++;
      else if (ch === '}') closes++;
      else if (ch === '[') openSq++;
      else if (ch === ']') closeSq++;
    }
    if (inStr) continue;
    const fixed = candidate + ']'.repeat(Math.max(0, openSq - closeSq)) + '}'.repeat(Math.max(0, opens - closes));
    try {
      const parsed = JSON.parse(fixed);
      console.warn("Recovered persona draft JSON via truncation fallback");
      return parsed;
    } catch { /* keep trimming */ }
  }
  console.error("Failed to parse persona draft JSON. Raw:", raw.slice(0, 500));
  return null;
}

function extractDraftBlock(reply: string): { json: string; truncated: boolean } | null {
  const closed = reply.match(/<draft>([\s\S]*?)<\/draft>/);
  if (closed) return { json: closed[1], truncated: false };
  const openIdx = reply.indexOf('<draft>');
  if (openIdx === -1) return null;
  return { json: reply.slice(openIdx + '<draft>'.length), truncated: true };
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

    const { message, session_id, project_id, icp_id, edit_persona_id } = await req.json();

    async function assertProject(pid: string): Promise<Response | null> {
      const { data: proj } = await supabase.from("projects").select("org_id").eq("id", pid).maybeSingle();
      if (!proj) return new Response(JSON.stringify({ error: "Project not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { data: accessOk } = await supabase.rpc("user_has_org_access", { _user_id: user.id, _org_id: proj.org_id });
      if (!accessOk) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return null;
    }
    if (project_id) { const r = await assertProject(project_id); if (r) return r; }
    if (session_id) {
      const { data: sess } = await supabase.from("wizard_sessions").select("project_id").eq("id", session_id).maybeSingle();
      if (sess?.project_id) { const r = await assertProject(sess.project_id); if (r) return r; }
    }


    let sessionId = session_id;
    let messages: Array<{ role: string; content: string; timestamp: string }> = [];
    let existingDraft: Record<string, any> = {};

    // Fetch ICP data, existing personas (full detail), and brand context
    let icpContext = "";
    let coveredRoles: string[] = [];
    let missingRoles: string[] = [];
    let priorPersonasInIcp: any[] = [];
    let priorPersonasProject: any[] = [];
    const ALL_BUYING_ROLES = ["champion", "economic_buyer", "influencer", "end_user", "blocker"];

    if (icp_id) {
      const [{ data: icpData }, { data: existingPersonas }] = await Promise.all([
        supabase.from("icps").select("*").eq("id", icp_id).single(),
        supabase.from("personas").select("*").eq("icp_id", icp_id).eq("is_current", true),
      ]);
      if (icpData) {
        icpContext = `\n\nICP CONTEXT (use this to inform your persona questions):\n- Segment: ${icpData.segment_name}\n- Matrix Category: ${icpData.matrix_category}\n- Fit Score: ${icpData.fit_score}/10, Access Score: ${icpData.access_score}/10\n- Firmographics: ${JSON.stringify(icpData.firmographics)}\n- Psychographics: ${JSON.stringify(icpData.psychographics)}\n- Buyer Roles: ${JSON.stringify(icpData.buyer_roles)}\n- Anti-ICP Signals: ${JSON.stringify(icpData.anti_icp_signals)}`;
      }
      if (existingPersonas && existingPersonas.length > 0) {
        priorPersonasInIcp = existingPersonas.filter((p: any) => p.id !== edit_persona_id);
        coveredRoles = existingPersonas.map((p: any) => p.role_in_buying);
        const coveredList = existingPersonas.map((p: any) => `  - ${p.persona_name} (${p.role_in_buying.replace('_', ' ')})`).join("\n");
        icpContext += `\n\nEXISTING PERSONAS FOR THIS ICP:\n${coveredList}`;
      }
      missingRoles = ALL_BUYING_ROLES.filter(r => !coveredRoles.includes(r));
      if (missingRoles.length > 0) {
        icpContext += `\n\nUNCOVERED BUYING ROLES: ${missingRoles.map(r => r.replace('_', ' ')).join(', ')}`;
      }
    }

    // Load all other personas in project (condensed) so AI never re-asks known company-level facts
    if (project_id) {
      const { data: allProjectPersonas } = await supabase
        .from("personas")
        .select("id, persona_name, role_in_buying, icp_id, organisational_context, how_we_help")
        .eq("project_id", project_id)
        .eq("is_current", true);
      if (allProjectPersonas) {
        priorPersonasProject = allProjectPersonas.filter(
          (p: any) => p.id !== edit_persona_id && !priorPersonasInIcp.find((q: any) => q.id === p.id)
        );
      }
    }

    // Editing an existing persona
    let editPersonaContext = "";
    let editPersonaName = "";
    if (edit_persona_id) {
      const { data: editPersona } = await supabase
        .from("personas").select("*").eq("id", edit_persona_id).single();
      if (editPersona) {
        editPersonaName = editPersona.persona_name;
        editPersonaContext = `\n\nEXISTING PERSONA DATA (the user wants to edit this persona):\n${JSON.stringify(editPersona, null, 2)}\n\nIMPORTANT: The user is editing an existing persona. Review the data above, summarise what's captured, then ask what they'd like to change and WHY.`;
      }
    }

    // Brand context: prefer brand_voices (source of truth), fall back to project.brand_context
    let brandContextStr = "";
    if (project_id) {
      const [{ data: bv }, { data: project }] = await Promise.all([
        supabase.from("brand_voices").select("brand_identity, tone_description, personality_adjectives, target_audiences")
          .eq("project_id", project_id).eq("status", "complete").maybeSingle(),
        supabase.from("projects").select("brand_context").eq("id", project_id).single(),
      ]);
      if (bv) {
        brandContextStr += `\n\n<known_company_facts>\nThese are ALREADY ESTABLISHED. NEVER ask the user to re-provide any of these. Reuse silently or state them back for confirmation only.\n${JSON.stringify({
          brand_identity: bv.brand_identity,
          tone: bv.tone_description,
          personality: bv.personality_adjectives,
          audiences: bv.target_audiences,
        }, null, 2)}\n</known_company_facts>`;
      }
      const bc = project?.brand_context as Record<string, any> | null;
      if (bc?.crawled_content && bc.crawled_content.length > 0) {
        brandContextStr += `\n\nBRAND CONTEXT (from previous website analysis of ${bc.website_url || "company website"}):\n${bc.crawled_content}`;
      }
    }

    // Known-personas context block
    const hasPriorPersonas = priorPersonasInIcp.length > 0 || priorPersonasProject.length > 0;
    let knownPersonasContext = "";
    if (priorPersonasInIcp.length > 0) {
      knownPersonasContext += `\n\n<existing_personas_in_this_icp>\nFull detail — reuse organisational_context, channels, and shared pains directly rather than re-asking.\n${JSON.stringify(priorPersonasInIcp.map((p: any) => ({
        id: p.id, persona_name: p.persona_name, role_in_buying: p.role_in_buying,
        organisational_context: p.organisational_context, goals: p.goals, pain_points: p.pain_points,
        channel_preferences: p.channel_preferences, buying_behaviour: p.buying_behaviour, how_we_help: p.how_we_help,
      })), null, 2)}\n</existing_personas_in_this_icp>`;
    }
    if (priorPersonasProject.length > 0) {
      knownPersonasContext += `\n\n<other_personas_in_project>\nCondensed reference — company-level facts here are AUTHORITATIVE. If a prior persona reflects "no website" or a similar fact, treat it as established.\n${JSON.stringify(priorPersonasProject, null, 2)}\n</other_personas_in_project>`;
    }

    // Diff-mode instruction when prior personas exist (skip when editing)
    let diffModeInstruction = "";
    if (hasPriorPersonas && !edit_persona_id) {
      const chipNames = priorPersonasInIcp.slice(0, 4).map((p: any) => p.persona_name);
      diffModeInstruction = `\n\n<diff_mode>\nThis is NOT the first persona for this project. Rules for your OPENING message:\n1. Do NOT re-ask company-level questions (website, product, industry, positioning). All that is in <known_company_facts> / <existing_personas_in_this_icp> / <other_personas_in_project>.\n2. Open by briefly acknowledging what you already know (1 short sentence). Then ask ONE question: is this new persona similar to an existing one in this ICP, a variation, or a different role? List existing personas in this ICP by name.\n3. Based on the user's answer:\n   - "Similar to X" → prefill your <draft> from persona X (drop persona_name/role_in_buying), then ask ONLY 2-3 questions about what differs (seniority, region, sub-function).\n   - "Variation of X" → prefill shared organisational_context/channels/how_we_help from X; ask 4-5 questions about differentiators (goals, pains, buying behaviour).\n   - "Different role" → keep company facts; ask fresh goals/pains/buying questions for the new role. Still skip company-level questions.\n4. Never ask a question whose answer is already in the known-context blocks above.\nSuggested quick-reply chips for the user (mention them at end of your message): ${chipNames.map((n: string) => `"Similar to ${n}"`).join(", ")}${chipNames.length ? ", " : ""}"Variation", "Different role"\n</diff_mode>`;
    }

    const syntheticPrompt = edit_persona_id
      ? `I want to edit the persona "${editPersonaName}". Show me what's currently captured and ask what I'd like to change.`
      : hasPriorPersonas
        ? "Open with the diff-mode question: acknowledge what you already know, then ask whether this new persona is similar to an existing one, a variation, or a different role. List existing personas in this ICP by name."
        : icp_id
          ? "Analyse the ICP buyer roles data and suggest the key buying influences I should build for this segment. Consider the firmographics, psychographics, and any existing persona coverage."
          : "Let's build a buyer persona. Ask me about the role or job title of the person I want to map and their role in the buying process.";


    if (!sessionId) {
      const userMsg = message || syntheticPrompt;
      messages = [{ role: "user", content: userMsg, timestamp: new Date().toISOString() }];

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

    let basePersonaPrompt: string;
    try {
      basePersonaPrompt = await getActivePrompt(supabase, "persona_wizard", "ANTHROPIC_PERSONA_SYSTEM_PROMPT");
    } catch {
      basePersonaPrompt = PERSONA_SYSTEM_PROMPT;
    }
    const systemPrompt = basePersonaPrompt + icpContext + editPersonaContext + brandContextStr;

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
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await response.json();
    const reply = aiData.content?.[0]?.text || "";
    const stopReason = aiData.stop_reason as string | undefined;

    let updatedDraft = existingDraft;
    let draftWarning: string | null = null;
    const draftBlock = extractDraftBlock(reply);
    if (draftBlock) {
      const parsed = robustJsonParse(draftBlock.json);
      if (parsed) {
        updatedDraft = mergeDrafts(existingDraft, parsed);
        if (draftBlock.truncated) {
          draftWarning = "The AI's response was cut short, but we recovered as much of the draft as possible. Ask it to continue if anything looks incomplete.";
        }
      } else {
        draftWarning = "The AI's draft output could not be parsed. Your previous draft is preserved. Ask the AI to re-output the draft.";
      }
    } else if (stopReason === "max_tokens") {
      draftWarning = "The AI's response was cut short before it produced a draft update. Ask it to continue.";
    }

    const cleanReply = reply.replace(/<draft>[\s\S]*?(?:<\/draft>|$)/, "").trim();

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
      JSON.stringify({ reply: cleanReply, updated_draft: updatedDraft, session_id: sessionId, draft_warning: draftWarning }),
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
