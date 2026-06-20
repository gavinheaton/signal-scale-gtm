import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ASSET_TYPE_PROMPTS: Record<string, string> = {
  blog: "Write a full blog post with an engaging headline, introduction, 3-4 sections with subheadings, and a conclusion with CTA. Aim for 800-1200 words.",
  linkedin_post: "Write a LinkedIn post (max 3000 chars). Hook in first line, value-driven body, clear CTA. Use line breaks for readability.",
  email: "Write a marketing email with subject line, preview text, body copy, and CTA button text. Keep it concise and action-oriented.",
  video: "Write a video script with: hook (first 5 seconds), problem statement, solution, key points, and CTA. Include visual direction notes in [brackets].",
  podcast: "Write a podcast episode outline with: episode title, intro script, 3-4 talking points with key messages, guest questions (if applicable), and outro/CTA.",
  webinar: "Write a webinar outline with: title, description, agenda (3-5 sections with timing), key slides content, Q&A prompts, and follow-up CTA.",
  whitepaper: "Write a whitepaper outline with: title, executive summary, 4-5 sections with key arguments and data points to include, and conclusion.",
  press_release: "Write a press release with: headline, subhead, dateline, lead paragraph, 2-3 body paragraphs with quotes, boilerplate, and contact info placeholder.",
};

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

    const { asset_id, campaign_id, prompt_override } = await req.json();

    if (!asset_id || !campaign_id) {
      return new Response(JSON.stringify({ error: "asset_id and campaign_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authorization: caller must belong to campaign's org
    const { data: campCheck } = await supabase
      .from("campaigns").select("id, project_id, projects!inner(org_id)").eq("id", campaign_id).maybeSingle();
    if (!campCheck) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const orgId = (campCheck as any).projects.org_id as string;
    const { data: accessOk } = await supabase.rpc("user_has_org_access", { _user_id: user.id, _org_id: orgId });
    if (!accessOk) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // Fetch asset
    const { data: asset, error: assetErr } = await supabase
      .from("campaign_assets").select("*").eq("id", asset_id).single();
    if (assetErr || !asset) {
      return new Response(JSON.stringify({ error: "Asset not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (asset.campaign_id !== campaign_id) {
      return new Response(JSON.stringify({ error: "Asset does not belong to campaign" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch campaign
    const { data: campaign } = await supabase
      .from("campaigns").select("*").eq("id", campaign_id).single();

    // Fetch brand voice
    const { data: brandVoices } = await supabase
      .from("brand_voices").select("*").eq("project_id", campaign?.project_id).eq("status", "complete").limit(1);
    const brandVoice = brandVoices?.[0] || null;

    // Fetch target personas
    let personas: any[] = [];
    if (asset.persona_target_ids?.length > 0) {
      const { data: pData } = await supabase
        .from("personas").select("*").in("id", asset.persona_target_ids);
      personas = pData || [];
    }

    const assetTypePrompt = ASSET_TYPE_PROMPTS[asset.asset_type] || "Write compelling marketing content.";

    let systemPrompt = `You are a B2B content strategist and copywriter. Generate high-quality marketing content.\n\n`;
    systemPrompt += `## CONTENT TYPE\n${asset.asset_type.replace(/_/g, ' ').toUpperCase()}\n${assetTypePrompt}\n\n`;

    if (campaign) {
      systemPrompt += `## CAMPAIGN CONTEXT\nCampaign: ${campaign.name}\nTrack: ${campaign.track?.replace(/_/g, ' ')}\nObjective: ${campaign.objective || 'Not specified'}\n`;
      if (campaign.channel_mix && Object.keys(campaign.channel_mix).length > 0) {
        systemPrompt += `Channel Mix: ${JSON.stringify(campaign.channel_mix)}\n`;
      }
      systemPrompt += `\n`;
    }

    if (brandVoice) {
      systemPrompt += `## BRAND VOICE\nTone: ${brandVoice.tone_description || 'Professional'}\n`;
      if (brandVoice.personality_adjectives?.length) {
        systemPrompt += `Personality: ${brandVoice.personality_adjectives.join(', ')}\n`;
      }

      // Brand identity context
      const bi = brandVoice.brand_identity;
      if (bi && typeof bi === 'object' && Object.keys(bi).length > 0) {
        if (bi.brand_name) systemPrompt += `Brand Name: ${bi.brand_name}\n`;
        if (bi.brand_name_rules) systemPrompt += `Name Usage Rules: ${bi.brand_name_rules}\n`;
        if (bi.locale) systemPrompt += `Locale/Language: ${bi.locale}\n`;
      }

      // Writing principles as numbered rules
      if (brandVoice.writing_principles?.length) {
        systemPrompt += `\n### Writing Principles (MUST follow)\n`;
        brandVoice.writing_principles.forEach((wp: any, i: number) => {
          systemPrompt += `${i + 1}. **${wp.principle}**: ${wp.explanation}\n`;
          if (wp.bad_example) systemPrompt += `   ✗ Bad: "${wp.bad_example}"\n`;
          if (wp.good_example) systemPrompt += `   ✓ Good: "${wp.good_example}"\n`;
        });
      }

      // Preferred vocabulary
      if (brandVoice.preferred_vocabulary?.length) {
        systemPrompt += `\n### Preferred Vocabulary\n`;
        brandVoice.preferred_vocabulary.forEach((v: any) => {
          systemPrompt += `- Use "${v.use}" instead of "${v.instead_of}"\n`;
        });
      }

      // Banned phrases
      if (brandVoice.banned_phrases?.length) {
        systemPrompt += `\n### Banned Phrases (NEVER use)\n${brandVoice.banned_phrases.join(', ')}\n`;
      }

      // Formatting rules
      if (brandVoice.formatting_rules?.length) {
        systemPrompt += `\n### Formatting Rules\n`;
        brandVoice.formatting_rules.forEach((r: string) => {
          systemPrompt += `- ${r}\n`;
        });
      }

      // Content-type-specific guidance (most impactful)
      const ctg = brandVoice.content_type_guidance;
      if (ctg && typeof ctg === 'object') {
        const typeKey = asset.asset_type;
        if (ctg[typeKey]) {
          systemPrompt += `\n### Content-Type Specific Guidance (for ${typeKey.replace(/_/g, ' ')})\n${ctg[typeKey]}\n`;
        }
      }

      // Writing samples as style reference
      if (brandVoice.writing_samples?.length) {
        const samples = brandVoice.writing_samples.slice(0, 2);
        systemPrompt += `\n### Writing Style Reference\n`;
        samples.forEach((s: any) => {
          const text = s.sample || s.content || s.text || '';
          if (text) {
            systemPrompt += `[${s.type || 'sample'}]: "${text.substring(0, 500)}"\n`;
          }
        });
      }

      systemPrompt += `\n`;
    }

    if (personas.length > 0) {
      systemPrompt += `## TARGET PERSONAS\n`;
      for (const p of personas) {
        systemPrompt += `- ${p.persona_name} (${p.role_in_buying}): ${JSON.stringify(p.pain_points || {})}\n`;
      }
      systemPrompt += `\n`;
    }

    systemPrompt += `Output ONLY the content in markdown format. No meta-commentary.`;

    const userMessage = prompt_override || `Generate a ${asset.asset_type.replace(/_/g, ' ')} titled "${asset.title}" for the campaign "${campaign?.name || 'Untitled'}".`;

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
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic error:", errText);
      return new Response(JSON.stringify({ error: "AI service error", details: errText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await response.json();
    let content: string = aiData.content?.[0]?.text || "";

    // Try to extract a strong title from the first markdown heading
    let extractedTitle: string | null = null;
    const headingMatch = content.match(/^\s*#{1,2}\s+(.+?)\s*$/m);
    if (headingMatch) {
      extractedTitle = headingMatch[1]
        .replace(/^["'*_]+|["'*_]+$/g, '')
        .trim();
      // Strip the heading line from the body so it isn't duplicated
      content = content.replace(headingMatch[0], '').replace(/^\s*\n+/, '');
    }

    // Decide whether to overwrite the existing title (only if it looks generic)
    const currentTitle = (asset.title || '').trim();
    const assetTypeLabel = asset.asset_type.replace(/_/g, ' ');
    const genericPatterns = [
      /^untitled/i,
      new RegExp(`^${assetTypeLabel}$`, 'i'),
      new RegExp(`^${assetTypeLabel}\\s*[-—–:]`, 'i'),
      new RegExp(`^${assetTypeLabel}\\s+\\d+$`, 'i'),
      new RegExp(`^${assetTypeLabel}\\s+(week|day|episode|part|#)\\s*\\d+`, 'i'),
      /^(blog post|email|linkedin post|video|podcast|webinar|whitepaper|press release)(\s|$)/i,
    ];
    const looksGeneric = !currentTitle || genericPatterns.some(re => re.test(currentTitle));

    const updates: Record<string, unknown> = { content, status: "draft" };
    if (extractedTitle && looksGeneric && extractedTitle.length <= 200) {
      updates.title = extractedTitle;
    }

    await supabase
      .from("campaign_assets")
      .update(updates)
      .eq("id", asset_id);

    return new Response(JSON.stringify({ content, asset_id, title: updates.title ?? currentTitle }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("generate-campaign-content error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
