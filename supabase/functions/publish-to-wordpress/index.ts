import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface ReqBody {
  asset_id: string;
  status?: "draft" | "publish" | "pending" | "future";
  site_id_override?: string; // wp.com only
}

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function mdToHtml(md: string): string {
  if (!md) return "";
  let html = md.trim();
  html = html.replace(/^### (.*)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.*)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.*)$/gm, "<h1>$1</h1>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  const blocks = html.split(/\n\n+/).map((b) => {
    const t = b.trim();
    if (!t) return "";
    if (/^<h[1-6]>/.test(t)) return t;
    return `<p>${t.replace(/\n/g, "<br/>")}</p>`;
  });
  return blocks.filter(Boolean).join("\n");
}

function normaliseBase(url: string) {
  let u = url.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(u)) u = `https://${u}`;
  return u;
}

async function readVaultSecret(sb: ReturnType<typeof createClient>, secretId: string): Promise<string> {
  // Read directly from vault.decrypted_secrets via service role
  const { data, error } = await (sb as any)
    .schema("vault")
    .from("decrypted_secrets")
    .select("decrypted_secret")
    .eq("id", secretId)
    .single();
  if (error || !data) throw new Error(`Could not read vault secret: ${error?.message}`);
  return data.decrypted_secret as string;
}

// ------------- WordPress.com flow -------------
async function publishToWordPressCom(opts: {
  token: string;
  siteId: string;
  asset: any;
  finalStatus: string;
  defaultCategory: string | null;
}) {
  const { token, siteId, asset, finalStatus, defaultCategory } = opts;
  const base = `https://public-api.wordpress.com/rest/v1.1/sites/${encodeURIComponent(siteId)}`;
  const seo = (asset.seo_meta as any) || {};
  const headers = { Authorization: `Bearer ${token}` };

  // Upload feature image
  let featuredMediaId: number | undefined;
  if (asset.feature_image_url) {
    const imgRes = await fetch(asset.feature_image_url);
    if (imgRes.ok) {
      const blob = await imgRes.blob();
      const fd = new FormData();
      fd.append("media[]", blob, `${asset.id}-feature.png`);
      const upRes = await fetch(`${base}/media/new`, { method: "POST", headers, body: fd });
      const upJson = await upRes.json();
      if (upRes.ok) featuredMediaId = upJson?.media?.[0]?.ID;
      else console.error("WP.com media upload failed:", upJson);
    }
  }

  const categories = seo.categories?.length
    ? seo.categories
    : defaultCategory ? [defaultCategory] : [];
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

  const postRes = await fetch(`${base}/posts/new`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(postBody),
  });
  const postJson = await postRes.json();
  if (!postRes.ok) {
    throw new Error(`WordPress.com post create failed [${postRes.status}]: ${JSON.stringify(postJson)}`);
  }
  return { post_id: String(postJson.ID), post_url: postJson.URL as string };
}

// ------------- Self-hosted WordPress flow -------------
async function resolveTermIds(opts: {
  base: string; auth: string; taxonomy: "categories" | "tags"; names: string[];
}): Promise<number[]> {
  const ids: number[] = [];
  for (const rawName of opts.names) {
    const name = rawName.trim();
    if (!name) continue;
    // search
    const sRes = await fetch(
      `${opts.base}/wp-json/wp/v2/${opts.taxonomy}?search=${encodeURIComponent(name)}&per_page=10`,
      { headers: { Authorization: `Basic ${opts.auth}` } },
    );
    if (sRes.ok) {
      const arr = await sRes.json();
      const match = Array.isArray(arr) ? arr.find((t: any) => t?.name?.toLowerCase() === name.toLowerCase()) : null;
      if (match?.id) { ids.push(match.id); continue; }
    }
    // create
    const cRes = await fetch(`${opts.base}/wp-json/wp/v2/${opts.taxonomy}`, {
      method: "POST",
      headers: { Authorization: `Basic ${opts.auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (cRes.ok) {
      const j = await cRes.json();
      if (j?.id) ids.push(j.id);
    } else {
      console.error(`Failed to create ${opts.taxonomy} '${name}':`, await cRes.text());
    }
  }
  return ids;
}

async function publishToSelfHosted(opts: {
  siteUrl: string;
  username: string;
  appPassword: string;
  asset: any;
  finalStatus: string;
  defaultCategory: string | null;
}) {
  const { siteUrl, username, appPassword, asset, finalStatus, defaultCategory } = opts;
  const base = normaliseBase(siteUrl);
  const auth = btoa(`${username}:${appPassword}`);
  const seo = (asset.seo_meta as any) || {};

  // Upload feature image
  let featuredMediaId: number | undefined;
  if (asset.feature_image_url) {
    const imgRes = await fetch(asset.feature_image_url);
    if (imgRes.ok) {
      const blob = await imgRes.blob();
      const ab = await blob.arrayBuffer();
      const filename = `${asset.id}-feature.png`;
      const upRes = await fetch(`${base}/wp-json/wp/v2/media`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": blob.type || "image/png",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
        body: ab,
      });
      const upJson = await upRes.json();
      if (upRes.ok) featuredMediaId = upJson?.id;
      else console.error("Self-hosted media upload failed:", upJson);
    }
  }

  // Resolve categories + tags (names → IDs)
  const catNames: string[] = seo.categories?.length ? seo.categories : (defaultCategory ? [defaultCategory] : []);
  const tagNames: string[] = seo.tags || [];

  const categoryIds = catNames.length ? await resolveTermIds({ base, auth, taxonomy: "categories", names: catNames }) : [];
  const tagIds = tagNames.length ? await resolveTermIds({ base, auth, taxonomy: "tags", names: tagNames }) : [];

  const postBody: any = {
    title: asset.title,
    content: mdToHtml(asset.content || ""),
    excerpt: seo.excerpt || seo.meta_description || "",
    slug: seo.slug || undefined,
    status: finalStatus,
  };
  if (featuredMediaId) postBody.featured_media = featuredMediaId;
  if (categoryIds.length) postBody.categories = categoryIds;
  if (tagIds.length) postBody.tags = tagIds;
  if (seo.meta_description) {
    postBody.meta = { _yoast_wpseo_metadesc: seo.meta_description };
  }

  const postRes = await fetch(`${base}/wp-json/wp/v2/posts`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify(postBody),
  });
  const postJson = await postRes.json();
  if (!postRes.ok) {
    throw new Error(`WordPress post create failed [${postRes.status}]: ${JSON.stringify(postJson).slice(0, 500)}`);
  }
  return { post_id: String(postJson.id), post_url: postJson.link as string };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { asset_id, status, site_id_override }: ReqBody = await req.json();
    if (!asset_id) return jsonRes({ error: "asset_id required" }, 400);

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Resolve asset → campaign → project → org
    const { data: asset, error: aErr } = await sb
      .from("campaign_assets")
      .select("id, title, content, feature_image_url, feature_image_alt, seo_meta, campaign_id, campaigns(project_id, projects(org_id))")
      .eq("id", asset_id)
      .single();
    if (aErr || !asset) throw new Error(aErr?.message || "Asset not found");

    const projectId = (asset as any).campaigns?.project_id;
    const orgId = (asset as any).campaigns?.projects?.org_id;
    if (!orgId) throw new Error("Could not resolve organisation for this asset");

    // Load org connection
    const { data: connection, error: cErr } = await sb
      .from("org_wordpress_connections")
      .select("flavor, site_url, username, credential_secret_id, default_category, default_status")
      .eq("org_id", orgId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!connection) {
      return jsonRes({
        error: "This organisation hasn't connected WordPress yet. Ask an admin to set it up in Settings → WordPress Connection.",
      }, 400);
    }

    // Project-level overrides
    const { data: projectSettings } = await sb
      .from("project_visual_settings")
      .select("wordpress_site_id, wordpress_default_category, wordpress_default_status")
      .eq("project_id", projectId)
      .maybeSingle();

    const finalStatus = status || projectSettings?.wordpress_default_status || connection.default_status || "draft";
    const defaultCategory = projectSettings?.wordpress_default_category || connection.default_category || null;

    // Read credential from vault
    const credential = await readVaultSecret(sb, connection.credential_secret_id);

    let result: { post_id: string; post_url: string };
    if (connection.flavor === "wordpress_com") {
      const siteId = site_id_override || projectSettings?.wordpress_site_id || connection.site_url;
      result = await publishToWordPressCom({
        token: credential, siteId, asset, finalStatus, defaultCategory,
      });
    } else {
      if (!connection.username) throw new Error("Self-hosted connection is missing username");
      result = await publishToSelfHosted({
        siteUrl: connection.site_url,
        username: connection.username,
        appPassword: credential,
        asset, finalStatus, defaultCategory,
      });
    }

    const updates: any = {
      wordpress_post_id: result.post_id,
      wordpress_post_url: result.post_url,
    };
    if (finalStatus === "publish") updates.status = "published";
    await sb.from("campaign_assets").update(updates).eq("id", asset_id);

    return jsonRes({ ...result, status: finalStatus });
  } catch (err: any) {
    console.error("publish-to-wordpress error:", err);
    return jsonRes({ error: err?.message || "Unknown error" }, 500);
  }
});
