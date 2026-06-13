import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { requireUser, assertAssetAccess, serviceClient } from "../_shared/auth.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface ReqBody {
  asset_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    let user;
    try { ({ user } = await requireUser(req, corsHeaders)); }
    catch (r) { return r as Response; }

    const { asset_id }: ReqBody = await req.json();
    if (!asset_id) {
      return new Response(JSON.stringify({ error: "asset_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = serviceClient();
    try { await assertAssetAccess(sb, user.id, asset_id); }
    catch (e: any) {
      return new Response(JSON.stringify({ error: e?.message || "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    const { data: asset, error: aErr } = await sb
      .from("campaign_assets")
      .select("id, title, content")
      .eq("id", asset_id)
      .single();
    if (aErr || !asset) throw new Error(aErr?.message || "Asset not found");

    const sysPrompt = `You generate SEO metadata for blog posts. Return ONLY a JSON object with: slug (kebab-case, max 60 chars), meta_description (150-160 chars, compelling), excerpt (1-2 sentences, ~200 chars), tags (5-8 relevant lowercase tags as string array), categories (1-3 broad topic categories as string array). No commentary.`;

    const userPrompt = `Title: ${asset.title}\n\nContent:\n${(asset.content || "").slice(0, 4000)}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sysPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) throw new Error(`AI call failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content as string;
    if (!text) throw new Error("Empty AI response");

    let seo: any;
    try { seo = JSON.parse(text); }
    catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("Could not parse JSON from AI response");
      seo = JSON.parse(m[0]);
    }

    await sb.from("campaign_assets").update({ seo_meta: seo }).eq("id", asset_id);

    return new Response(JSON.stringify({ seo_meta: seo }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("generate-seo-metadata error:", err);
    return new Response(JSON.stringify({ error: err?.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
