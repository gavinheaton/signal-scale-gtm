import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import {
  PROPRESENCE_BASE,
  buildPreferPhrases,
  buildStructuralPrefs,
  buildToneText,
  getProjectPropresenceKey,
} from "../_shared/propresence.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const service = createClient(supabaseUrl, serviceRoleKey);
    const { project_id } = await req.json();
    if (!project_id) throw new Error("project_id required");

    const { apiKey, target } = await getProjectPropresenceKey(service, project_id);
    if (!apiKey) throw new Error("ProPresence not connected for this project");

    const { data: brandVoice } = await service
      .from("brand_voices")
      .select("*")
      .eq("project_id", project_id)
      .eq("status", "complete")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!brandVoice) throw new Error("No completed brand voice found for this project");

    const toneText = buildToneText(brandVoice);

    // PUT full tone replacement
    const putRes = await fetch(`${PROPRESENCE_BASE}/tone-api`, {
      method: "PUT",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ target, tone_of_voice: toneText }),
    });
    if (!putRes.ok) {
      const t = await putRes.text();
      throw new Error(`ProPresence tone PUT failed (${putRes.status}): ${t}`);
    }

    // PATCH refinements
    const patchRes = await fetch(`${PROPRESENCE_BASE}/tone-api`, {
      method: "PATCH",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        target,
        avoid_phrases: brandVoice.banned_phrases || [],
        prefer_phrases: buildPreferPhrases(brandVoice),
        structural_preferences: buildStructuralPrefs(brandVoice),
      }),
    });
    if (!patchRes.ok) {
      const t = await patchRes.text();
      console.warn("ProPresence tone PATCH non-2xx:", patchRes.status, t);
    }

    const now = new Date().toISOString();
    await service.from("brand_voices").update({ propresence_synced_at: now }).eq("id", brandVoice.id);
    await service.from("projects").update({ propresence_tone_synced_at: now }).eq("id", project_id);

    return new Response(JSON.stringify({ success: true, synced_at: now }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("sync-tone-to-propresence error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
