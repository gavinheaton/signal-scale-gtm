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

    // Fetch asset
    const { data: asset, error: assetErr } = await supabase
      .from("campaign_assets").select("*").eq("id", asset_id).single();
    if (assetErr || !asset) {
      return new Response(JSON.stringify({ error: "Asset not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      if (brandVoice.banned_phrases?.length) {
        systemPrompt += `Avoid: ${brandVoice.banned_phrases.join(', ')}\n`;
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
    const content = aiData.content?.[0]?.text || "";

    // Update asset with content and set status to draft
    await supabase
      .from("campaign_assets")
      .update({ content, status: "draft" })
      .eq("id", asset_id);

    return new Response(JSON.stringify({ content, asset_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("generate-campaign-content error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
