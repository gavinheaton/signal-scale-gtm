import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GATEWAY = "https://connector-gateway.lovable.dev/wordpress_com";

interface ReqBody {
  asset_id: string;
  status?: "draft" | "publish" | "pending" | "future";
  site_id_override?: string;
}

// Convert markdown content to basic HTML for WordPress (lightweight: paragraphs + headings + bold/italic + links)
function mdToHtml(md: string): string {
  if (!md) return "";
  let html = md.trim();
  // Headings
  html = html.replace(/^### (.*)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.*)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.*)$/gm, "<h1>$1</h1>");
  // Bold / italic
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  // Paragraphs (split on blank lines, wrap non-heading lines)
  const blocks = html.split(/\n\n+/).map((b) => {
    const t = b.trim();
    if (!t) return "";
    if (/^<h[1-6]>/.test(t)) return t;
    return `<p>${t.replace(/\n/g, "<br/>")}</p>`;
  });
  return blocks.filter(Boolean).join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const WP_KEY = Deno.env.get("WORDPRESS_COM_API_KEY");
    if (!WP_KEY) {
      return new Response(JSON.stringify({
        error: "WordPress.com is not connected. Connect it in Workspace settings first.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { asset_id, status, site_id_override }: ReqBody = await req.json();
    if (!asset_id) {
      return new Response(JSON.stringify({ error: "asset_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: asset, error: aErr } = await sb
      .from("campaign_assets")
      .select("id, title, content, feature_image_url, feature_image_alt, seo_meta, campaign_id, campaigns(project_id)")
      .eq("id", asset_id)
      .single();
    if (aErr || !asset) throw new Error(aErr?.message || "Asset not found");

    const projectId = (asset as any).campaigns?.project_id;
    const { data: settings } = await sb
      .from("project_visual_settings")
      .select("wordpress_site_id, wordpress_default_category, wordpress_default_status")
      .eq("project_id", projectId)
      .maybeSingle();

    const siteId = site_id_override || settings?.wordpress_site_id;
    if (!siteId) throw new Error("WordPress site ID not configured. Set it in Settings → Visuals & Publishing.");

    const finalStatus = status || settings?.wordpress_default_status || "draft";
    const seo = (asset.seo_meta as any) || {};
    const headers = {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": WP_KEY,
      "Content-Type": "application/json",
    };

    // 1. Upload feature image as media (if present)
    let featuredMediaId: number | undefined;
    if (asset.feature_image_url) {
      const imgRes = await fetch(asset.feature_image_url);
      if (imgRes.ok) {
        const blob = await imgRes.blob();
        const fd = new FormData();
        fd.append("media[]", blob, `${asset.id}-feature.png`);
        const upRes = await fetch(`${GATEWAY}/rest/v1.1/sites/${encodeURIComponent(siteId)}/media/new`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": WP_KEY,
          },
          body: fd,
        });
        const upJson = await upRes.json();
        if (upRes.ok) {
          featuredMediaId = upJson?.media?.[0]?.ID;
        } else {
          console.error("WP media upload failed:", upJson);
        }
      }
    }

    // 2. Create the post
    const categories = seo.categories?.length
      ? seo.categories
      : settings?.wordpress_default_category ? [settings.wordpress_default_category] : [];
    const tags = seo.tags || [];

    const postBody: any = {
      title: asset.title,
      content: mdToHtml(asset.content || ""),
      excerpt: seo.excerpt || seo.meta_description || "",
      slug: seo.slug || undefined,
      status: finalStatus,
      categories: categories.join(","),
      tags: tags.join(","),
    };
    if (featuredMediaId) postBody.featured_image = featuredMediaId;
    if (seo.meta_description) {
      postBody.metadata = [
        { key: "_yoast_wpseo_metadesc", value: seo.meta_description, operation: "update" },
      ];
    }

    const postRes = await fetch(`${GATEWAY}/rest/v1.1/sites/${encodeURIComponent(siteId)}/posts/new`, {
      method: "POST", headers, body: JSON.stringify(postBody),
    });
    const postJson = await postRes.json();
    if (!postRes.ok) {
      throw new Error(`WordPress post create failed [${postRes.status}]: ${JSON.stringify(postJson)}`);
    }

    // 3. Save back to asset
    const updates: any = {
      wordpress_post_id: String(postJson.ID),
      wordpress_post_url: postJson.URL,
    };
    if (finalStatus === "publish") updates.status = "published";
    await sb.from("campaign_assets").update(updates).eq("id", asset_id);

    return new Response(JSON.stringify({
      post_id: postJson.ID, post_url: postJson.URL, status: finalStatus,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("publish-to-wordpress error:", err);
    return new Response(JSON.stringify({ error: err?.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
