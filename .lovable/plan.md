

# Generate Visual Feature Images for Content Assets

## Your process → automated equivalent

Your manual workflow has 8 steps. Here's how each maps to automation in the platform:

| Your step | Automated version |
|---|---|
| Write + approve article | Already exists (Edit + status workflow in asset drawer) |
| Generate catchy title | Already exists (asset has `title` field, AI-editable) |
| Midjourney → 4 options, pick best | **AI image generation via Lovable AI (Nano Banana Pro)** — generate 4 variants, you pick |
| Canva template + title overlay | **Server-side compositing**: render the chosen AI image with the article title overlaid using a project-defined template (font, position, color, logo) |
| Download image | **Stored in Supabase Storage**, downloadable + previewable inline |
| Upload to WordPress with SEO/tags/categories/feature image | **WordPress.com connector** — push post + feature image in one click |
| Track in Asana | **Already in your kanban** (`campaign_assets.status` already does this — no Asana needed) |

What's lost vs Midjourney specifically: aesthetic fingerprint differs. Nano Banana Pro is good at photoreal/editorial but doesn't match Midjourney style 1:1. To get close we use a **project-level visual style preset** (saved prompt fragment describing your aesthetic — e.g. "editorial photography, technology-themed, warm human-centered lighting, shallow depth of field, no text") prepended to every generation so output is consistent across articles.

## What gets built

### 1. Database — new `asset_images` table + storage bucket
- `asset_images`: `id, asset_id (→campaign_assets), storage_path, prompt, variant_index, is_selected, is_composited, created_at`
- Storage bucket `asset-images` (public read, authenticated write) with RLS scoped via asset → campaign → project → org
- Add columns to `campaign_assets`: `feature_image_url text`, `feature_image_alt text`, `seo_meta jsonb` (slug, meta description, tags, categories)
- Add `visual_style_preset text` and `wordpress_site_id text`, `wordpress_default_category text` to `brand_voices` or a new `project_visual_settings` table

### 2. Edge functions
- **`generate-asset-image`** — takes `asset_id` + optional prompt override, calls Lovable AI Gateway with `google/gemini-3-pro-image-preview` (Nano Banana Pro), generates **4 variants** in parallel, uploads each to storage, inserts 4 `asset_images` rows. Builds the prompt from: brand voice visual style preset + article title + AI-derived theme summary from article content.
- **`composite-feature-image`** — takes a selected `asset_image_id`, fetches the image, overlays the article title using a server-side canvas (Deno `@img/canvas` or similar) with template settings (font, gradient, logo, position), uploads composited result, sets it as `campaign_assets.feature_image_url`.
- **`generate-seo-metadata`** — AI call to produce slug, meta description, suggested tags/categories from article content. Stored in `seo_meta`.
- **`publish-to-wordpress`** — uses WordPress.com connector to: (1) upload feature image as media, (2) create post with title/content/excerpt/categories/tags/featured_media, (3) set status (draft|publish), (4) write returned post URL back to `campaign_assets`.

### 3. Frontend — `AssetDetailDrawer` extensions
A new "Visuals & Publish" section appears on the asset drawer for `blog` (and other applicable types):

```text
┌─ Visuals & Publish ──────────────────────────┐
│  Feature Image                               │
│  ┌──────┐                                    │
│  │      │  [Generate 4 variants]             │
│  │      │  [Re-generate] [Edit prompt]       │
│  └──────┘                                    │
│                                              │
│  Variants (when generated):                  │
│  [img1] [img2] [img3] [img4]                 │
│  Click to select → "Apply title overlay"     │
│                                              │
│  SEO                                         │
│  Slug: [...]    [Auto-generate]              │
│  Meta description: [...]                     │
│  Tags: [chip] [chip] [+ add]                 │
│  Categories: [select multi]                  │
│                                              │
│  Publish to WordPress                        │
│  Site: [dropdown]   Status: ○ Draft ● Publish│
│  [Publish to WordPress]                      │
│  Last published: <link to live post>         │
└──────────────────────────────────────────────┘
```

### 4. Project-level visual style settings
New tab in Settings or Brand Voice detail page where user defines:
- **Visual style preset** (textarea: "editorial photo, tech-themed, human-centered, warm lighting, shallow DoF…")
- **Title overlay template**: font family/size/weight, color, gradient overlay opacity, logo position, safe-zone padding
- **WordPress defaults**: site, default category, default status

### 5. WordPress integration
Use the **WordPress.com connector** (already documented in your context). Workspace owner connects their wordpress.com account once → site IDs available per-project. For self-hosted WP, would need a separate path (custom REST API + app password) — out of scope unless requested.

## Workflow once built

1. Asset moves to `approved` status (existing flow)
2. User clicks **Generate 4 variants** → 4 images appear in ~15s
3. User clicks the favorite → clicks **Apply title overlay** → composited preview replaces it
4. User clicks **Auto-generate SEO** → slug/meta/tags fill in (editable)
5. User clicks **Publish to WordPress** → post goes live, asset status flips to `published`, live URL stored

End-to-end: ~30 seconds vs your current ~30 minutes per article.

## Open questions

1. **WordPress flavor** — wordpress.com (connector available, easy) or self-hosted (custom REST + app password, more work)?
2. **Image generation model** — Nano Banana Pro (best quality, slower/pricier) or standard Nano Banana (faster, cheaper, quality still good)?
3. **Title overlay engine** — server-side Deno canvas (programmatic, fast, no third-party) or generate via second AI image-edit call (more flexible composition, slower)?
4. **Scope now vs later** — do all 5 components in one pass, or ship just the image generation + selection first and add SEO/WordPress after?

## Files to create / change

**New**
- `supabase/migrations/<ts>_asset_images.sql` — table, bucket, RLS, new columns
- `supabase/functions/generate-asset-image/index.ts`
- `supabase/functions/composite-feature-image/index.ts`
- `supabase/functions/generate-seo-metadata/index.ts`
- `supabase/functions/publish-to-wordpress/index.ts`
- `src/components/campaigns/AssetVisualsPanel.tsx`
- `src/components/campaigns/AssetSEOPanel.tsx`
- `src/components/campaigns/AssetPublishPanel.tsx`
- `src/components/settings/VisualStyleSettings.tsx`

**Modified**
- `src/components/campaigns/AssetDetailDrawer.tsx` — mount the three new panels
- `src/types/database.ts` — new types for `AssetImage`, extended `CampaignAsset`, visual settings
- `supabase/config.toml` — register new functions

