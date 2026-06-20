import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Superadmin gate
    const { data: isSuper } = await supabase.rpc("is_superadmin", { _user_id: user.id });
    if (!isSuper) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { template_key, prompt_text, sample_input_json } = body ?? {};
    if (typeof prompt_text !== "string" || prompt_text.trim().length === 0) {
      return new Response(JSON.stringify({ error: "prompt_text is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sampleBlock = sample_input_json
      ? `\n\n## SAMPLE INPUT (template_key: ${template_key ?? "n/a"})\n${
          typeof sample_input_json === "string"
            ? sample_input_json
            : JSON.stringify(sample_input_json, null, 2)
        }`
      : "";

    const userMsg = "This is a dry-run test of the system prompt above. Respond as you normally would given the sample input context." +
      sampleBlock;

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
        system: prompt_text,
        messages: [{ role: "user", content: userMsg }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Anthropic error:", errorText);
      return new Response(
        JSON.stringify({ error: "AI service error", details: errorText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aiData = await response.json();
    const raw_output: string = aiData.content?.[0]?.text ?? "";

    // Try to parse — prompts often wrap JSON in <draft>...</draft> or ```json fences.
    let looks_like_valid_json = false;
    const candidates: string[] = [raw_output];
    const draftMatch = raw_output.match(/<draft>([\s\S]*?)<\/draft>/);
    if (draftMatch) candidates.push(draftMatch[1]);
    const fenceMatch = raw_output.match(/```json\s*([\s\S]*?)```/);
    if (fenceMatch) candidates.push(fenceMatch[1]);
    for (const c of candidates) {
      try { JSON.parse(c.trim()); looks_like_valid_json = true; break; } catch { /* keep trying */ }
    }

    return new Response(
      JSON.stringify({ raw_output, looks_like_valid_json }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("test-prompt-template error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
