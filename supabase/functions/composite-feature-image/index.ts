// Composites the article title onto the selected AI-generated image using
// AI image editing (Nano Banana edit mode) since Deno canvas is unreliable in edge runtime.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { requireUser, assertAssetImageAccess, serviceClient } from "../_shared/auth.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MODEL = "google/gemini-2.5-flash-image";

interface ReqBody {
  asset_image_id: string;
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

    const { asset_image_id }: ReqBody = await req.json();
    if (!asset_image_id) {
      return new Response(JSON.stringify({ error: "asset_image_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = serviceClient();
    try { await assertAssetImageAccess(sb, user.id, asset_image_id); }
    catch (e: any) {
      return new Response(JSON.stringify({ error: e?.message || "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    const { data: img, error: iErr } = await sb
      .from("asset_images")
      .select("id, asset_id, public_url, storage_path, aspect")
      .eq("id", asset_image_id)
      .single();
    if (iErr || !img) throw new Error(iErr?.message || "Image not found");

    const aspect: "16:9" | "1:1" = (img as any).aspect === "1:1" ? "1:1" : "16:9";
    const aspectPhrase = aspect === "1:1"
      ? "Preserve the original 1:1 square aspect ratio exactly — do not crop to widescreen."
      : "Preserve the original 16:9 widescreen aspect ratio exactly — do not crop to square.";

    const { data: asset, error: aErr } = await sb
      .from("campaign_assets")
      .select("id, title, campaign_id, campaigns(project_id)")
      .eq("id", img.asset_id)
      .single();
    if (aErr || !asset) throw new Error(aErr?.message || "Asset not found");

    const projectId = (asset as any).campaigns?.project_id;

    const { data: settings } = await sb
      .from("project_visual_settings")
      .select("overlay_template")
      .eq("project_id", projectId)
      .maybeSingle();

    const tmpl = settings?.overlay_template || {
      font_family: "Poppins", font_size: 72, font_weight: 700,
      text_color: "#FFFFFF", gradient_opacity: 0.55, gradient_direction: "bottom",
      padding: 80, max_width_pct: 80, alignment: "left",
    };

    // Use AI edit to overlay the title
    const editPrompt = `Add the following article title text overlaid on this image as a magazine-style cover. Title: "${asset.title}". Style: bold ${tmpl.font_family} sans-serif, weight ${tmpl.font_weight}, color ${tmpl.text_color}, large size, positioned ${tmpl.alignment} ${tmpl.gradient_direction === "top" ? "top" : "bottom"} with ${Math.round(tmpl.padding)}px padding. Add a subtle dark gradient fade behind the text from the ${tmpl.gradient_direction} for legibility (opacity ~${tmpl.gradient_opacity}). Keep the original image composition intact — only add the text and gradient overlay. Do not crop, distort, or change colors of the underlying photo. ${aspectPhrase}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: editPrompt },
            { type: "image_url", image_url: { url: img.public_url } },
          ],
        }],
        modalities: ["image", "text"],
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(`AI edit failed: ${res.status} ${t}`);
    }
    const data = await res.json();
    const composited = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url as string | undefined;
    if (!composited) throw new Error("No composited image returned");

    const { bytes, contentType } = dataUrlToBytes(composited);
    const ext = contentType.split("/")[1] || "png";
    const path = `${projectId}/${img.asset_id}/composited-${Date.now()}.${ext}`;
    const { error: upErr } = await sb.storage.from("asset-images").upload(path, bytes, {
      contentType, upsert: false,
    });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
    const { data: pub } = sb.storage.from("asset-images").getPublicUrl(path);

    // Mark all variants for this asset as not selected, then mark this composite as selected + composited
    await sb.from("asset_images").update({ is_selected: false }).eq("asset_id", img.asset_id);

    const { data: newRow, error: newErr } = await sb.from("asset_images").insert({
      asset_id: img.asset_id,
      storage_path: path,
      public_url: pub.publicUrl,
      prompt: editPrompt,
      variant_index: 99,
      is_selected: true,
      is_composited: true,
      aspect,
    }).select().single();
    if (newErr) throw new Error(newErr.message);

    // Update the campaign_asset feature_image_url
    await sb.from("campaign_assets")
      .update({ feature_image_url: pub.publicUrl, feature_image_alt: asset.title })
      .eq("id", img.asset_id);

    return new Response(JSON.stringify({ image: newRow, feature_image_url: pub.publicUrl }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("composite-feature-image error:", err);
    return new Response(JSON.stringify({ error: err?.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
