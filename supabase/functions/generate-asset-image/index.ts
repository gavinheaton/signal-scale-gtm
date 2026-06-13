import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { requireUser, assertAssetAccess, serviceClient } from "../_shared/auth.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MODEL = "google/gemini-2.5-flash-image"; // Nano Banana — fast, good quality
const VARIANT_COUNT = 4;

type Aspect = "16:9" | "1:1";

interface ReqBody {
  asset_id: string;
  prompt_override?: string;
  variant_count?: number;
  aspect?: Aspect;
}

async function generateOne(prompt: string): Promise<string | null> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    }),
  });
  if (!res.ok) {
    console.error("Image gen failed:", res.status, await res.text());
    return null;
  }
  const data = await res.json();
  const url = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url as string | undefined;
  return url ?? null;
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; contentType: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid data URL");
  const contentType = match[1];
  const b64 = match[2];
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, contentType };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    let user;
    try { ({ user } = await requireUser(req, corsHeaders)); }
    catch (r) { return r as Response; }

    const { asset_id, prompt_override, variant_count, aspect: aspectIn }: ReqBody = await req.json();
    const aspect: Aspect = aspectIn === "1:1" ? "1:1" : "16:9";
    if (!asset_id) {
      return new Response(JSON.stringify({ error: "asset_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = serviceClient();
    try { await assertAssetAccess(sb, user.id, asset_id); }
    catch (e: any) {
      return new Response(JSON.stringify({ error: e?.message || "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // Load asset + campaign + project + visual settings
    const { data: asset, error: aErr } = await sb
      .from("campaign_assets")
      .select("id, title, content, asset_type, campaign_id, campaigns(project_id, projects(id))")
      .eq("id", asset_id)
      .single();
    if (aErr || !asset) throw new Error(aErr?.message || "Asset not found");

    const projectId = (asset as any).campaigns?.project_id;
    if (!projectId) throw new Error("Project not found for asset");

    const { data: settings } = await sb
      .from("project_visual_settings")
      .select("visual_style_preset")
      .eq("project_id", projectId)
      .maybeSingle();

    const stylePreset =
      settings?.visual_style_preset ||
      "editorial photography, technology-themed, human-centered, warm lighting, shallow depth of field, no text, no logos, cinematic";

    // Build prompt: style preset + title + brief content theme
    const contentSummary = (asset.content || "").slice(0, 500).replace(/\s+/g, " ").trim();
    const aspectPhrase = aspect === "1:1"
      ? "1:1 square composition, centered subject, balanced framing on all four sides"
      : "16:9 horizontal widescreen composition";
    const basePrompt =
      prompt_override ||
      `${stylePreset}. Concept inspired by the article titled "${asset.title}". ${
        contentSummary ? `Article context: ${contentSummary}.` : ""
      } The image must contain NO text, NO logos, NO watermarks. ${aspectPhrase}.`;

    const count = Math.min(Math.max(variant_count ?? VARIANT_COUNT, 1), 4);

    // Generate variants in parallel
    const results = await Promise.all(
      Array.from({ length: count }).map(() => generateOne(basePrompt)),
    );

    const inserted: any[] = [];
    for (let i = 0; i < results.length; i++) {
      const dataUrl = results[i];
      if (!dataUrl) continue;
      try {
        const { bytes, contentType } = dataUrlToBytes(dataUrl);
        const ext = contentType.split("/")[1] || "png";
        const path = `${projectId}/${asset_id}/${Date.now()}-v${i}.${ext}`;
        const { error: upErr } = await sb.storage.from("asset-images").upload(path, bytes, {
          contentType,
          upsert: false,
        });
        if (upErr) {
          console.error("Upload err:", upErr);
          continue;
        }
        const { data: pub } = sb.storage.from("asset-images").getPublicUrl(path);
        const { data: row, error: insErr } = await sb
          .from("asset_images")
          .insert({
            asset_id,
            storage_path: path,
            public_url: pub.publicUrl,
            prompt: basePrompt,
            variant_index: i,
            is_selected: false,
            is_composited: false,
            aspect,
          })
          .select()
          .single();
        if (insErr) {
          console.error("Insert err:", insErr);
          continue;
        }
        inserted.push(row);
      } catch (e) {
        console.error("Variant error:", e);
      }
    }

    if (inserted.length === 0) {
      return new Response(JSON.stringify({ error: "No images were generated" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ images: inserted }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("generate-asset-image error:", err);
    return new Response(JSON.stringify({ error: err?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
