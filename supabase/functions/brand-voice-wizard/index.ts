import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const FALLBACK_SYSTEM_PROMPT = `You are an expert brand strategist specialising in B2B brand voice development. Your job is to guide the user through building a comprehensive brand voice guide by having a structured conversation.

You must fill in ALL sections of the brand voice:

1. **Personality Adjectives** — 3-5 words that describe the brand's personality
2. **Tone Description** — A paragraph describing how the brand sounds
3. **Writing Principles** — Rules for how to write, each with principle, explanation, bad_example, good_example
4. **Banned Phrases** — Words and phrases the brand should never use
5. **Preferred Vocabulary** — Words to use instead of common alternatives (use/instead_of pairs)
6. **Formatting Rules** — Rules about formatting (e.g., Oxford comma, sentence case)
7. **Content Type Guidance** — Tone adjustments per content type (linkedin_post, email_campaign, client_report, proposal, website_copy, handbook)
8. **Writing Samples** — Example content in the brand voice (type + sample pairs)
9. **Target Audiences** — Key audience segments with tone adjustments per segment
10. **Brand Identity** — Brand name, brand name rules, primary/accent colours, font, locale

INSTRUCTIONS:
- Ask ONE focused question at a time.
- After each exchange, track which sections are filled and which need more.
- When you have enough for a section, summarise what you've captured.
- Be conversational and consultative.
- When a website URL is provided, the page content will be included. Analyse it and map findings to brand voice sections.

After EVERY response, output a JSON block wrapped in <draft> tags:
<draft>
{
  "personality_adjectives": ["string"],
  "tone_description": "string",
  "writing_principles": [{"principle": "string", "explanation": "string", "bad_example": "string", "good_example": "string"}],
  "banned_phrases": ["string"],
  "preferred_vocabulary": [{"use": "string", "instead_of": "string"}],
  "formatting_rules": ["string"],
  "content_type_guidance": {"linkedin_post": "", "email_campaign": "", "client_report": "", "proposal": "", "website_copy": "", "handbook": ""},
  "writing_samples": [{"type": "string", "sample": "string"}],
  "target_audiences": [{"segment": "string", "tone_adjustment": "string"}],
  "brand_identity": {"brand_name": "", "brand_name_rules": "", "primary_colour": "", "accent_colour": "", "font": "", "locale": ""},
  "sections_complete": [],
  "is_complete": false
}
</draft>

CRITICAL JSON RULES:
- Output valid JSON only inside <draft> tags. No trailing commas, no comments.
- Always include ALL section keys even if empty.
- Set is_complete to true ONLY when all sections have substantive content.
- sections_complete should list keys that have enough content: personality_adjectives, tone_description, writing_principles, banned_phrases, preferred_vocabulary, formatting_rules, content_type_guidance, writing_samples, target_audiences, brand_identity`;

const DOCUMENT_ANALYSIS_PROMPT = `The user has uploaded an existing brand voice / tone of voice document. Its text content is included below.

TASK — Run a strict two-pass analysis against the Signal+Scale brand voice schema:

PASS 1 — EXTRACTION (populate <draft>):
Map the document to these 10 sections ONLY, using evidence from the document:
  1. personality_adjectives
  2. tone_description
  3. writing_principles (principle + explanation + bad_example + good_example)
  4. banned_phrases
  5. preferred_vocabulary (use / instead_of)
  6. formatting_rules
  7. content_type_guidance (linkedin_post, email_campaign, client_report, proposal, website_copy, handbook)
  8. writing_samples (type + sample)
  9. target_audiences (segment + tone_adjustment)
  10. brand_identity (brand_name, brand_name_rules, primary_colour, accent_colour, font, locale)

Rules:
- NEVER invent. If the document gives no evidence for a field, leave it empty.
- Only list a key in "sections_complete" when the doc supplies substantive, specific content for it (not a vague mention).
- A section with thin or ambiguous evidence stays out of sections_complete (it is "partial").

PASS 2 — GAP REPORT (your chat reply, before the <draft> block):
Output a markdown report with exactly three groups, in this order. Use the section icon + label.
  ### ✅ Captured
  - {icon} {Section} — one-line summary of what the doc said
  ### ⚠️ Partial
  - {icon} {Section} — what's there / what's missing
  ### ❌ Missing
  - {icon} {Section}
Then ask ONE focused question to fill the highest-priority gap (Missing first, then Partial). Do not ask multiple questions.

Section icons: ✨ Personality, 🎵 Tone, 📝 Writing Principles, 🚫 Banned Phrases, 📖 Vocabulary, 📐 Formatting, 📋 Content Types, ✍️ Writing Samples, 🎯 Audiences, 🏷️ Brand Identity.

--- DOCUMENT CONTENT ---
`;


const INITIAL_MESSAGE = "Let's define your brand voice. I'll guide you through building a comprehensive brand voice guide. To start — what's your company name and website URL? If you have any existing brand guidelines or messaging, feel free to share those too.";

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
    console.error("Failed to parse draft JSON. Raw:", raw.slice(0, 500));
    return null;
  }
}

async function extractDocumentText(supabase: any, fileUrl: string): Promise<string> {
  try {
    // fileUrl format: brand-voice-uploads/{project_id}/{filename}
    const { data, error } = await supabase.storage
      .from('brand-voice-uploads')
      .download(fileUrl);

    if (error || !data) {
      console.error("Storage download error:", error);
      return "[Failed to download the uploaded document]";
    }

    const fileName = fileUrl.toLowerCase();

    if (fileName.endsWith('.txt') || fileName.endsWith('.md')) {
      return (await data.text()).slice(0, 8000);
    }

    if (fileName.endsWith('.docx')) {
      return await extractDocxText(data);
    }

    if (fileName.endsWith('.pdf')) {
      return await extractPdfText(data);
    }

    // Fallback: try as text
    return (await data.text()).slice(0, 8000);
  } catch (err) {
    console.error("Document extraction error:", err);
    return "[Error extracting document text]";
  }
}

async function extractDocxText(blob: Blob): Promise<string> {
  try {
    // DOCX is a zip file; word/document.xml contains the text
    const { default: JSZip } = await import("https://esm.sh/jszip@3.10.1");
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const docXml = await zip.file("word/document.xml")?.async("text");
    if (!docXml) return "[Could not read DOCX content]";

    // Strip XML tags to get plain text
    const text = docXml
      .replace(/<w:p[^>]*>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return text.slice(0, 8000);
  } catch (err) {
    console.error("DOCX extraction error:", err);
    return "[Failed to extract text from DOCX]";
  }
}

async function extractPdfText(blob: Blob): Promise<string> {
  try {
    // Basic PDF text extraction - look for text streams
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const rawText = new TextDecoder('latin1').decode(bytes);

    // Extract text between BT and ET markers (PDF text objects)
    const textParts: string[] = [];
    const btEtRegex = /BT\s([\s\S]*?)ET/g;
    let match;
    while ((match = btEtRegex.exec(rawText)) !== null) {
      const block = match[1];
      // Extract text from Tj and TJ operators
      const tjRegex = /\(([^)]*)\)\s*Tj/g;
      let tjMatch;
      while ((tjMatch = tjRegex.exec(block)) !== null) {
        textParts.push(tjMatch[1]);
      }
      // TJ arrays
      const tjArrayRegex = /\[([^\]]*)\]\s*TJ/g;
      let tjArrMatch;
      while ((tjArrMatch = tjArrayRegex.exec(block)) !== null) {
        const innerRegex = /\(([^)]*)\)/g;
        let innerMatch;
        while ((innerMatch = innerRegex.exec(tjArrMatch[1])) !== null) {
          textParts.push(innerMatch[1]);
        }
      }
    }

    const text = textParts.join(' ').replace(/\s+/g, ' ').trim();
    if (text.length < 50) {
      return "[PDF text extraction returned minimal content — the PDF may be image-based/scanned. Please upload a text-based document instead (TXT, DOCX, or MD).]";
    }
    return text.slice(0, 8000);
  } catch (err) {
    console.error("PDF extraction error:", err);
    return "[Failed to extract text from PDF]";
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

    const { message, session_id, project_id, file_url } = await req.json();

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

    // Load brand context, ICPs, and personas
    let brandContext: Record<string, any> = {};
    let icps: any[] = [];
    let personas: any[] = [];
    if (project_id) {
      const [projectRes, icpRes, personaRes] = await Promise.all([
        supabase.from("projects").select("brand_context").eq("id", project_id).single(),
        supabase.from("icps").select("segment_name, firmographics, psychographics, matrix_category, fit_score").eq("project_id", project_id),
        supabase.from("personas").select("persona_name, role_in_buying, goals, pain_points, channel_preferences, icp_id").eq("project_id", project_id),
      ]);
      if (projectRes.data?.brand_context && Object.keys(projectRes.data.brand_context).length > 0) {
        brandContext = projectRes.data.brand_context as Record<string, any>;
      }
      icps = icpRes.data || [];
      personas = personaRes.data || [];
    }

    // Extract document text if file_url provided
    let documentText = "";
    if (file_url) {
      documentText = await extractDocumentText(supabase, file_url);
    }

    // Build pre-seeded target_audiences from ICPs/personas
    const hasAudienceContext = icps.length > 0 || personas.length > 0;
    let preSeededDraft: Record<string, any> = {};
    if (hasAudienceContext) {
      const seededAudiences: Array<{ segment: string; tone_adjustment: string }> = [];
      for (const icp of icps) {
        seededAudiences.push({ segment: icp.segment_name, tone_adjustment: "" });
      }
      for (const p of personas) {
        seededAudiences.push({ segment: `${p.persona_name} (${p.role_in_buying})`, tone_adjustment: "" });
      }
      preSeededDraft = { target_audiences: seededAudiences };
    }

    // Determine initial message based on context
    const initialMessageText = hasAudienceContext
      ? "I can see you've already defined your ICPs and personas — I'll use those to shape the audience sections. Let's start with your company name and how you want your brand to sound."
      : INITIAL_MESSAGE;

    if (!sessionId) {
      // Determine initial user message based on whether a document was uploaded
      let initialUserMessage = message || "";
      if (documentText && documentText.length > 0 && !documentText.startsWith("[Failed") && !documentText.startsWith("[Error") && !documentText.startsWith("[Could not") && !documentText.startsWith("[PDF text")) {
        initialUserMessage = `I've uploaded my existing brand voice document. Please analyse it and extract as much as you can.\n\n${DOCUMENT_ANALYSIS_PROMPT}${documentText}`;
      }

      const initialMsg = { role: "assistant", content: documentText ? "I've received your brand voice document. Let me analyse it..." : initialMessageText, timestamp: new Date().toISOString() };
      messages = [initialMsg];

      if (initialUserMessage) {
        messages.push({ role: "user", content: initialUserMessage, timestamp: new Date().toISOString() });
      }

      const { data: session, error: insertError } = await supabase
        .from("wizard_sessions")
        .insert({ project_id, session_type: "brand_voice", messages, draft_output: preSeededDraft, status: "in_progress" })
        .select("id").single();

      if (insertError) {
        return new Response(JSON.stringify({ error: insertError.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      sessionId = session.id;
      existingDraft = preSeededDraft;

      // Create initial brand_voices record
      await supabase.from("brand_voices").insert({
        project_id, status: "draft", wizard_session_id: sessionId,
        ...(hasAudienceContext ? { target_audiences: preSeededDraft.target_audiences } : {}),
      });

      if (!initialUserMessage) {
        return new Response(JSON.stringify({ reply: initialMessageText, updated_draft: preSeededDraft, session_id: sessionId }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      const { data: session, error: fetchError } = await supabase
        .from("wizard_sessions").select("*").eq("id", sessionId).single();

      if (fetchError || !session) {
        return new Response(JSON.stringify({ error: "Session not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      messages = session.messages as typeof messages;
      existingDraft = (session.draft_output as Record<string, any>) || {};
      messages.push({ role: "user", content: message, timestamp: new Date().toISOString() });
    }

    // URL fetching
    const lastUserMsg = messages[messages.length - 1];
    let enrichedContent = lastUserMsg.content;
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
    const urls = lastUserMsg.role === "user" ? lastUserMsg.content.match(urlRegex) : null;

    if (urls && urls.length > 0) {
      for (const url of urls.slice(0, 2)) {
        try {
          const fetchRes = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; BrandVoiceWizardBot/1.0)" },
            redirect: "follow",
          });
          if (fetchRes.ok) {
            let html = await fetchRes.text();
            html = html.replace(/<script[\s\S]*?<\/script>/gi, "");
            html = html.replace(/<style[\s\S]*?<\/style>/gi, "");
            html = html.replace(/<[^>]+>/g, " ");
            html = html.replace(/\s+/g, " ").trim();
            enrichedContent += `\n\n[Fetched content from ${url}]:\n${html.slice(0, 4000)}`;
          } else {
            enrichedContent += `\n\n[Failed to fetch ${url}: HTTP ${fetchRes.status}]`;
            await fetchRes.text();
          }
        } catch (fetchErr) {
          enrichedContent += `\n\n[Failed to fetch ${url}: ${fetchErr instanceof Error ? fetchErr.message : "unknown error"}]`;
        }
      }
      messages[messages.length - 1] = { ...lastUserMsg, content: enrichedContent };
    }

    // Build system prompt
    const systemPromptEnv = Deno.env.get("ANTHROPIC_BRAND_VOICE_SYSTEM_PROMPT");
    let systemPrompt = systemPromptEnv || FALLBACK_SYSTEM_PROMPT;

    const hasBrandContext = brandContext.crawled_content && brandContext.crawled_content.length > 0;
    if (hasBrandContext) {
      systemPrompt += `\n\nBRAND CONTEXT (from previous analysis of ${brandContext.website_url || "company website"}):\n${brandContext.crawled_content}\n\nUse this to inform your brand voice questions.`;
    }

    // Inject ICP & Persona context
    if (icps.length > 0) {
      const icpSummary = icps.map((icp: any) => {
        const firmSummary = icp.firmographics ? ` — ${JSON.stringify(icp.firmographics)}` : '';
        return `- ${icp.segment_name} (${icp.matrix_category}, fit: ${icp.fit_score ?? 'N/A'})${firmSummary}`;
      }).join('\n');
      systemPrompt += `\n\nPROJECT ICPs (already defined — do NOT ask the user to describe their target audience from scratch):\n${icpSummary}`;
    }

    if (personas.length > 0) {
      const personaSummary = personas.map((p: any) => {
        const goals = p.goals ? ` Goals: ${JSON.stringify(p.goals)}` : '';
        const pains = p.pain_points ? ` Pain points: ${JSON.stringify(p.pain_points)}` : '';
        return `- ${p.persona_name} (${p.role_in_buying})${goals}${pains}`;
      }).join('\n');
      systemPrompt += `\n\nPROJECT PERSONAS (already defined):\n${personaSummary}`;
    }

    if (hasAudienceContext) {
      systemPrompt += `\n\nIMPORTANT: Since ICPs and personas are already defined, pre-populate the target_audiences section using these segments. Do NOT ask "Who is your audience?" — instead ask nuanced questions about how tone should shift for each segment/persona (e.g., "How should your tone differ when addressing a ${personas[0]?.persona_name || 'champion'} vs an ${personas[1]?.persona_name || 'economic buyer'}?").`;
    }

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
        max_tokens: 4096,
        system: systemPrompt,
        messages: anthropicMessages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Anthropic error:", errorText);
      return new Response(JSON.stringify({ error: "AI service error", details: errorText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      }
    }

    const cleanReply = reply.replace(/<draft>[\s\S]*?<\/draft>/, "").trim();
    messages.push({ role: "assistant", content: reply, timestamp: new Date().toISOString() });

    const isComplete = (updatedDraft as any)?.is_complete === true;

    // Update wizard session
    await supabase.from("wizard_sessions").update({
      messages, draft_output: updatedDraft, status: isComplete ? "complete" : "in_progress",
    }).eq("id", sessionId);

    // Upsert brand_voices record
    const brandVoiceStatus = isComplete ? "complete" : "in_progress";
    const { data: existingBv } = await supabase
      .from("brand_voices")
      .select("id")
      .eq("wizard_session_id", sessionId)
      .limit(1)
      .maybeSingle();

    const brandVoiceData = {
      status: brandVoiceStatus,
      personality_adjectives: updatedDraft.personality_adjectives || [],
      tone_description: updatedDraft.tone_description || null,
      writing_principles: updatedDraft.writing_principles || [],
      banned_phrases: updatedDraft.banned_phrases || [],
      preferred_vocabulary: updatedDraft.preferred_vocabulary || [],
      formatting_rules: updatedDraft.formatting_rules || [],
      content_type_guidance: updatedDraft.content_type_guidance || {},
      writing_samples: updatedDraft.writing_samples || [],
      target_audiences: updatedDraft.target_audiences || [],
      brand_identity: updatedDraft.brand_identity || {},
      updated_at: new Date().toISOString(),
    };

    if (existingBv) {
      await supabase.from("brand_voices").update(brandVoiceData).eq("id", existingBv.id);
    } else {
      await supabase.from("brand_voices").insert({
        ...brandVoiceData,
        project_id,
        wizard_session_id: sessionId,
      });
    }

    // Auto-sync to ProPresence when brand voice is just marked complete
    if (isComplete) {
      try {
        const { data: pconn } = await supabase.from("project_connections")
          .select("id").eq("project_id", project_id).eq("provider", "propresence").maybeSingle();
        if (pconn) {
          // Fire-and-forget — don't block the wizard response
          const fnUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/sync-tone-to-propresence`;
          fetch(fnUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              "apikey": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
            },
            body: JSON.stringify({ project_id }),
          }).catch((e) => console.warn("ProPresence auto-sync failed:", e?.message));
        }
      } catch (e) {
        console.warn("ProPresence auto-sync check failed:", e);
      }
    }

    return new Response(JSON.stringify({
      reply: cleanReply, updated_draft: updatedDraft, session_id: sessionId,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("brand-voice-wizard error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
