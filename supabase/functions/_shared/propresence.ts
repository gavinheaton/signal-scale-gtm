// Shared helpers for ProPresence integration
export const PROPRESENCE_BASE =
  "https://rjkqibkujmykwnfxooop.supabase.co/functions/v1";

export async function getProjectPropresenceKey(
  serviceClient: any,
  projectId: string,
): Promise<{ apiKey: string | null; target: "personal" | "company" }> {
  const { data: project } = await serviceClient
    .from("projects")
    .select("propresence_target")
    .eq("id", projectId)
    .single();

  const target = (project?.propresence_target as "personal" | "company") || "company";

  const { data: conn } = await serviceClient
    .from("project_connections")
    .select("api_key_secret_id")
    .eq("project_id", projectId)
    .eq("provider", "propresence")
    .maybeSingle();

  if (!conn?.api_key_secret_id) return { apiKey: null, target };

  // Read decrypted secret from vault
  const { data: secretRow } = await serviceClient
    .schema("vault" as any)
    .from("decrypted_secrets")
    .select("decrypted_secret")
    .eq("id", conn.api_key_secret_id)
    .maybeSingle();

  return { apiKey: (secretRow?.decrypted_secret as string) || null, target };
}

export function buildToneText(bv: any): string {
  const adjectives = (bv.personality_adjectives || []).join(", ");
  const principles = (bv.writing_principles || [])
    .map((p: any) =>
      typeof p === "string"
        ? p
        : `${p.principle || p.name || ""}: ${p.explanation || p.description || ""}`
    )
    .join(" ");
  const formatting = (bv.formatting_rules || []).join(" ");
  const brandName = bv?.brand_identity?.brand_name_rules || "";
  return `${bv.tone_description || ""}

Core traits: ${adjectives}.

${principles}

Formatting: ${formatting}

Brand name: ${brandName}`.trim();
}

export function buildStructuralPrefs(bv: any): string {
  const ctg = bv?.content_type_guidance;
  if (!ctg || typeof ctg !== "object") return "";
  return Object.entries(ctg)
    .map(([type, guidance]) => `${type}: ${typeof guidance === "string" ? guidance : JSON.stringify(guidance)}`)
    .join("\n");
}

export function buildPreferPhrases(bv: any): string[] {
  return (bv.preferred_vocabulary || [])
    .map((v: any) => (typeof v === "string" ? v : v.use || v.preferred || ""))
    .filter(Boolean);
}

const LONG_FORM = new Set(["blog", "whitepaper", "press_release", "webinar"]);

const CHANNEL_MAP: Record<string, string> = {
  blog: "Blog",
  video: "YouTube",
  podcast: "Podcast",
  linkedin_post: "LinkedIn",
  email: "Email",
  webinar: "Webinar",
  whitepaper: "Blog",
  press_release: "PR",
};

const CONTENT_TYPE_MAP: Record<string, string> = {
  blog: "Article",
  video: "Video",
  podcast: "Audio",
  linkedin_post: "Post",
  email: "Email",
  webinar: "Video",
  whitepaper: "Whitepaper",
  press_release: "Article",
};

export function isLongFormAsset(assetType: string): boolean {
  return LONG_FORM.has(assetType);
}

// Tiny markdown → HTML for article body. Keeps things minimal — paragraphs, headings, bullets.
export function markdownToHtml(md: string): string {
  if (!md) return "";
  const lines = md.split("\n");
  const out: string[] = [];
  let inList = false;
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) {
      if (inList) { out.push("</ul>"); inList = false; }
      continue;
    }
    if (t.startsWith("### ")) {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<h3>${escapeHtml(t.slice(4))}</h3>`);
    } else if (t.startsWith("## ")) {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<h2>${escapeHtml(t.slice(3))}</h2>`);
    } else if (t.startsWith("# ")) {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<h1>${escapeHtml(t.slice(2))}</h1>`);
    } else if (t.startsWith("- ") || t.startsWith("* ")) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${escapeHtml(t.slice(2))}</li>`);
    } else {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<p>${escapeHtml(t)}</p>`);
    }
  }
  if (inList) out.push("</ul>");
  return out.join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildAssetPayload(
  asset: any,
  campaign: any,
  target: "personal" | "company",
): { endpoint: "articles-api" | "api-v2-posts"; payload: Record<string, unknown>; isLongForm: boolean } {
  const isLongForm = isLongFormAsset(asset.asset_type);
  const channel = CHANNEL_MAP[asset.asset_type];
  const contentType = CONTENT_TYPE_MAP[asset.asset_type];
  const demandTag =
    campaign?.track === "demand_creation" ? "demand-creation" : "demand-capture";

  const tags = [channel, contentType, demandTag, campaign?.name]
    .filter(Boolean);

  if (isLongForm) {
    return {
      endpoint: "articles-api",
      isLongForm,
      payload: {
        title: asset.title,
        body: markdownToHtml(asset.content || ""),
        target,
        source_url: asset.notion_url || null,
        tags,
      },
    };
  }
  return {
    endpoint: "api-v2-posts",
    isLongForm,
    payload: {
      body: asset.content || asset.title,
      target,
      scheduled_at: asset.publish_date
        ? new Date(asset.publish_date).toISOString()
        : null,
      tags: tags.slice(0, 3),
    },
  };
}

export async function pushAssetToPropresence(
  asset: any,
  campaign: any,
  apiKey: string,
  target: "personal" | "company",
): Promise<{ id: string; isLongForm: boolean }> {
  const { endpoint, payload, isLongForm } = buildAssetPayload(asset, campaign, target);
  const res = await fetch(`${PROPRESENCE_BASE}/${endpoint}`, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ProPresence ${endpoint} ${res.status}: ${text}`);
  }
  const result = await res.json().catch(() => ({}));
  const id = result?.id || result?.post_id || result?.article_id || "";
  return { id: String(id), isLongForm };
}
