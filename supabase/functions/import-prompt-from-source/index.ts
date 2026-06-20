import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { ICP_SYSTEM_PROMPT } from "../icp-wizard/index.ts";
import { PERSONA_SYSTEM_PROMPT } from "../persona-wizard/index.ts";
import { FALLBACK_SYSTEM_PROMPT as BRAND_VOICE_FALLBACK } from "../brand-voice-wizard/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Map template key → { secret name, hardcoded fallback }
const SOURCES: Record<string, { secret?: string; fallback?: string }> = {
  icp_wizard: { secret: "ANTHROPIC_ICP_SYSTEM_PROMPT", fallback: ICP_SYSTEM_PROMPT },
  persona_wizard: { secret: "ANTHROPIC_PERSONA_SYSTEM_PROMPT", fallback: PERSONA_SYSTEM_PROMPT },
  brand_voice_wizard: { secret: "ANTHROPIC_BRAND_VOICE_SYSTEM_PROMPT", fallback: BRAND_VOICE_FALLBACK },
  campaign_wizard: { secret: "ANTHROPIC_CAMPAIGN_SYSTEM_PROMPT" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isSuper } = await supabase.rpc("is_superadmin", { _user_id: user.id });
    if (!isSuper) {
      return new Response(JSON.stringify({ error: "Forbidden — superadmin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { template_key } = await req.json();
    const src = SOURCES[template_key];
    if (!src) {
      return new Response(JSON.stringify({ error: `No import source defined for "${template_key}"` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let promptText: string | undefined;
    let usedSource: "secret" | "fallback" | null = null;
    if (src.secret) {
      const v = Deno.env.get(src.secret);
      if (v && v.trim()) {
        promptText = v;
        usedSource = "secret";
      }
    }
    if (!promptText && src.fallback) {
      promptText = src.fallback;
      usedSource = "fallback";
    }
    if (!promptText) {
      return new Response(JSON.stringify({
        error: `No source available — secret "${src.secret}" is empty and no hardcoded fallback exists.`,
      }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Find template
    const { data: tpl, error: tplErr } = await supabase
      .from("ai_prompt_templates")
      .select("id")
      .eq("key", template_key)
      .maybeSingle();
    if (tplErr || !tpl) {
      return new Response(JSON.stringify({ error: "Template not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert new version
    const { data: version, error: insErr } = await supabase
      .from("ai_prompt_template_versions")
      .insert({
        template_id: tpl.id,
        prompt_text: promptText,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (insErr || !version) {
      return new Response(JSON.stringify({ error: insErr?.message || "Insert failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase
      .from("ai_prompt_templates")
      .update({ current_version_id: version.id })
      .eq("id", tpl.id);

    return new Response(JSON.stringify({
      success: true,
      version_id: version.id,
      source: usedSource,
      char_count: promptText.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("import-prompt-from-source error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
