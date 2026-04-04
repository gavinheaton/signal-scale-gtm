import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiKey = authHeader.replace("Bearer ", "");
  if (!apiKey.startsWith("gtm_")) {
    return new Response(JSON.stringify({ error: "Invalid API key format" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const keyHash = await hashKey(apiKey);

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Look up the key
  const { data: keyRow, error: keyError } = await supabaseAdmin
    .from("api_keys")
    .select("id, user_id")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (keyError || !keyRow) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Update last_used_at
  await supabaseAdmin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyRow.id);

  // Get user's org
  const { data: orgId } = await supabaseAdmin.rpc("user_org_id", {
    _user_id: keyRow.user_id,
  });

  if (!orgId) {
    return new Response(JSON.stringify({ error: "No organisation found" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Get projects for the org
  const { data: projects } = await supabaseAdmin
    .from("projects")
    .select("id, name, slug")
    .eq("org_id", orgId);

  if (!projects || projects.length === 0) {
    return new Response(JSON.stringify({ brand_voices: [] }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const projectIds = projects.map((p) => p.id);
  const projectMap = Object.fromEntries(
    projects.map((p) => [p.id, { name: p.name, slug: p.slug }])
  );

  // Get completed brand voices
  const { data: brandVoices, error: bvError } = await supabaseAdmin
    .from("brand_voices")
    .select("*")
    .eq("status", "complete")
    .in("project_id", projectIds);

  if (bvError) {
    return new Response(JSON.stringify({ error: "Failed to fetch brand voices" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const result = (brandVoices || []).map((bv) => {
    const project = projectMap[bv.project_id];
    return {
      schema_version: "1.0",
      project_slug: project?.slug || "",
      project_name: project?.name || "",
      generated_at: bv.updated_at,
      generated_by: "gtm-platform-brand-voice-wizard",
      brand_voice: {
        personality_adjectives: bv.personality_adjectives,
        tone_description: bv.tone_description,
        writing_principles: bv.writing_principles,
        banned_phrases: bv.banned_phrases,
        preferred_vocabulary: bv.preferred_vocabulary,
        formatting_rules: bv.formatting_rules,
        content_type_guidance: bv.content_type_guidance,
        writing_samples: bv.writing_samples,
        target_audiences: bv.target_audiences,
        brand_identity: bv.brand_identity,
      },
    };
  });

  return new Response(JSON.stringify({ brand_voices: result }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
