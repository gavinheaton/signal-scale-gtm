import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getActivePrompt } from "../_shared/promptTemplates.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export { ICP_SYSTEM_PROMPT } from "../_shared/defaultPrompts.ts";
import { ICP_SYSTEM_PROMPT } from "../_shared/defaultPrompts.ts";

const INITIAL_MESSAGE_NO_CONTEXT = "Let's build your ICP. I'll start by researching your company — what's your website URL? If you have existing customers, personas, or messaging you'd like me to work from, you can share those too.";

const INITIAL_MESSAGE_WITH_CONTEXT = "I already have context on your brand from a previous session. Let's define a new ICP segment — what market, vertical, or customer type are you targeting with this one?";

const ICP_CONTEXT_VERSION = "company_context_v2";

function buildKnownCompanyFactsBlock(
  projectInfo: Record<string, any>,
  brandContext: Record<string, any>,
  brandVoiceContext: Record<string, any> | null,
  existingIcps: any[],
): string {
  const facts = {
    project: {
      name: projectInfo?.name || null,
      website_url: projectInfo?.website_url || brandContext?.website_url || null,
    },
    completed_brand_voice: brandVoiceContext ? {
      brand_identity: brandVoiceContext.brand_identity,
      tone_description: brandVoiceContext.tone_description,
      personality_adjectives: brandVoiceContext.personality_adjectives,
      target_audiences: brandVoiceContext.target_audiences,
    } : null,
    existing_icps_as_company_context: existingIcps.map((icp: any) => ({
      id: icp.id,
      segment_name: icp.segment_name,
      matrix_category: icp.matrix_category,
      fit_score: icp.fit_score,
      access_score: icp.access_score,
      firmographics: icp.firmographics,
      psychographics: icp.psychographics,
      buyer_roles: icp.buyer_roles,
      anti_icp_signals: icp.anti_icp_signals,
    })),
  };

  return `\n\n<known_company_facts>\nThese facts are already established for this project. Treat them as authoritative company/project context. Infer the company's base offer, audience, market assumptions, buying-culture patterns, and anti-fit patterns from the existing ICPs and brand voice. Do NOT ask the user to re-provide website, company, product, positioning, target-market basics, buyer roles, or shared anti-ICP patterns already visible here. Reuse them silently unless you need to confirm a genuine ambiguity.\n${JSON.stringify(facts, null, 2)}\n</known_company_facts>`;
}

function buildRuntimeDiffRules(existingIcps: any[]): string {
  const segmentNames = existingIcps.map((i: any) => i.segment_name).filter(Boolean).join(", ");
  return `\n\n<runtime_icp_diff_rules>\nThese runtime rules override any older admin-managed ICP prompt text.\n1. If <known_company_facts> or <existing_icps> is present, never start by asking for company basics, website URL, product description, positioning, broad target market, known buyer roles, or known anti-ICP patterns.\n2. For a new ICP when existing ICPs are present${segmentNames ? ` (${segmentNames})` : ""}, open with one short acknowledgement of what is already known, then ask only whether the new ICP is a variation of an existing segment or a genuinely different segment.\n3. If the user says "Variation of X", prefill the draft by inheriting reusable firmographics, psychographics, buyer_roles_behaviour, operational_readiness, alignment_urgency, and anti_icp_signals from X where applicable. Add inherited_sections mapping inherited section keys to X's ICP id. Ask only about deltas.\n4. If the user says "Different segment", still inherit company-wide facts, buying-culture norms, known buyer-role patterns, and anti-ICP patterns. Ask only for what distinguishes this segment.\n5. Every response must continue producing the <draft> JSON block.\n</runtime_icp_diff_rules>`;
}

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

/** Try to parse JSON with cleanup for common LLM issues. Handles truncated payloads. */
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

  // Truncation-tolerant fallback: progressively trim back to a safe boundary
  // and close any unbalanced braces/brackets until we get parseable JSON.
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
      console.warn("Recovered draft JSON via truncation fallback");
      return parsed;
    } catch { /* keep trimming */ }
  }
  console.error("Failed to parse draft JSON even after cleanup. Raw:", raw.slice(0, 500));
  return null;
}

/** Extract a <draft>...</draft> block, tolerating a missing closing tag. */
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

    // Authorization: caller must belong to the project's org
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

    // Load brand context from the project
    let brandContext: Record<string, any> = {};
    if (project_id) {
      const { data: project } = await supabase
        .from("projects")
        .select("brand_context")
        .eq("id", project_id)
        .single();
      if (project?.brand_context && Object.keys(project.brand_context).length > 0) {
        brandContext = project.brand_context as Record<string, any>;
      }
    }

    const hasBrandContext = brandContext.crawled_content && brandContext.crawled_content.length > 0;

    // Fetch existing ICPs so the AI can reuse them rather than re-asking (diff mode)
    let existingIcps: any[] = [];
    if (project_id) {
      const { data: icps } = await supabase
        .from("icps")
        .select("id, segment_name, matrix_category, fit_score, access_score, firmographics, psychographics, buyer_roles, anti_icp_signals")
        .eq("project_id", project_id)
        .order("created_at", { ascending: true });
      existingIcps = icps || [];
    }
    const hasPriorIcps = existingIcps.length > 0;

    const initialMessage = hasPriorIcps
      ? `I can see you've already defined ${existingIcps.length} ICP${existingIcps.length > 1 ? 's' : ''} for this project (${existingIcps.map((i: any) => i.segment_name).join(', ')}). Is this new segment a variation of one of those, or a different segment entirely?`
      : hasBrandContext ? INITIAL_MESSAGE_WITH_CONTEXT : INITIAL_MESSAGE_NO_CONTEXT;

    if (!sessionId) {
      const initialMsg = {
        role: "assistant",
        content: initialMessage,
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

      const initialDraftOutput = { _meta: { mode: hasPriorIcps ? "diff" : "first" } } as Record<string, any>;
      const { data: session, error: insertError } = await supabase
        .from("wizard_sessions")
        .insert({
          project_id,
          session_type: "icp",
          messages,
          status: "in_progress",
          draft_output: initialDraftOutput,
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
        const initialSuggestedReplies = hasPriorIcps
          ? [
              ...existingIcps.slice(0, 3).map((i: any) => `Variation of ${i.segment_name}`),
              "Different segment",
              "Ask me everything",
            ]
          : [];
        return new Response(
          JSON.stringify({
            reply: initialMessage,
            updated_draft: initialDraftOutput,
            session_id: sessionId,
            suggested_replies: initialSuggestedReplies,
            existing_icp_count: existingIcps.length,
            mode: hasPriorIcps ? "diff" : "first",
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
    let newlyCrawledContent: { url: string; content: string } | null = null;

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

            // Save the first crawl as brand context if none exists yet
            if (!hasBrandContext && !newlyCrawledContent) {
              newlyCrawledContent = { url, content: cleaned };
            }
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

    // Save brand context to project if this is the first crawl
    if (newlyCrawledContent && project_id) {
      await supabase
        .from("projects")
        .update({
          brand_context: {
            website_url: newlyCrawledContent.url,
            crawled_content: newlyCrawledContent.content,
            crawled_at: new Date().toISOString(),
          },
        })
        .eq("id", project_id);
      console.log("Saved brand context to project:", project_id);
    }

    // Build system prompt with brand context if available
    let systemPrompt: string;
    try {
      systemPrompt = await getActivePrompt(supabase, "icp_wizard", "ANTHROPIC_ICP_SYSTEM_PROMPT");
    } catch {
      systemPrompt = ICP_SYSTEM_PROMPT;
    }
    if (hasBrandContext) {
      systemPrompt += `\n\nBRAND CONTEXT (from previous analysis of ${brandContext.website_url || "company website"}):\n${brandContext.crawled_content}\n\nUse this to inform your ICP questions. Do NOT ask for the website URL again — you already have the brand context.`;
    }
    if (hasPriorIcps) {
      systemPrompt += `\n\n<existing_icps>\nThis project already has the following ICPs. Reuse their firmographics/psychographics/buyer_roles/anti-ICP signals rather than re-asking. Ask only about deltas for the new segment.\n${JSON.stringify(existingIcps, null, 2)}\n</existing_icps>`;
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
    const stopReason = aiData.stop_reason as string | undefined;

    // Extract and merge draft (tolerant of truncated <draft> blocks)
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
        console.error("Draft parse failed, preserving existing draft");
        draftWarning = "The AI's draft output could not be parsed. Your previous draft is preserved. Ask the AI to re-output the draft.";
      }
    } else if (stopReason === "max_tokens") {
      draftWarning = "The AI's response was cut short before it produced a draft update. Ask it to continue.";
    }

    const cleanReply = reply.replace(/<draft>[\s\S]*?(?:<\/draft>|$)/, "").trim();

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

    const suggestedReplies = hasPriorIcps
      ? [
          ...existingIcps.slice(0, 3).map((i: any) => `Variation of ${i.segment_name}`),
          "Different segment",
          "Ask me everything",
        ]
      : [];

    const sessionMode = (existingDraft?._meta?.mode as string) || (hasPriorIcps ? "diff" : "first");

    return new Response(
      JSON.stringify({
        reply: cleanReply,
        updated_draft: updatedDraft,
        session_id: sessionId,
        draft_warning: draftWarning,
        suggested_replies: suggestedReplies,
        existing_icp_count: existingIcps.length,
        mode: sessionMode,
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
