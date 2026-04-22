

# Per-Organisation WordPress Connections (Self-Hosted + WordPress.com)

## Problem
Current `publish-to-wordpress` uses a single workspace-wide WordPress.com connector secret. We need:
1. **Per-organisation** credentials (each client publishes to their own site)
2. Support for **self-hosted WordPress** sites, not just wordpress.com

## Solution

### 1. New table: `org_wordpress_connections`
One row per org. Supports both flavours:

| Column | Purpose |
|---|---|
| `org_id` (unique FK) | Which organisation owns this connection |
| `flavor` enum (`wordpress_com` \| `self_hosted`) | Which API to call |
| `site_url` text | e.g. `https://clientblog.com` (self-hosted) or `clientsite.wordpress.com` |
| `username` text (nullable) | Self-hosted only — WP username |
| `credential_secret_id` uuid | Vault ref to either: WP.com OAuth token, or self-hosted **application password** |
| `default_category`, `default_status` | Org-level publishing defaults |
| `connected_by`, `connected_at`, `updated_at` | Audit |

RLS: only `owner`/`admin`/`superadmin` of the org can read/write. Credential never leaves Vault.

### 2. New edge function: `manage-org-wordpress-connection`
- `POST` — store credentials in Vault, insert/update row. Validates by hitting `/wp-json/wp/v2/users/me` (self-hosted) or `/rest/v1.1/me` (wp.com) before saving.
- `DELETE` — remove vault secret + row.
- Permission check: caller must be admin of `org_id`.

### 3. Rewrite `publish-to-wordpress`
- Resolve `asset → campaign → project → org_id`
- Load `org_wordpress_connections` row for that org
- If missing → 400 with friendly message: "Connect WordPress in Organisation Settings first."
- Read credential from Vault via service-role
- Branch on `flavor`:
  - **`wordpress_com`**: existing flow but call `https://public-api.wordpress.com/rest/v1.1/sites/{site_id}/...` directly with `Authorization: Bearer <token>` (no Lovable gateway, no shared key)
  - **`self_hosted`**: call `{site_url}/wp-json/wp/v2/...` with `Authorization: Basic base64(username:app_password)`. Endpoints: `POST /media` for feature image, `POST /posts` with `{title, content, excerpt, slug, status, categories, tags, featured_media, meta}`. Self-hosted accepts category/tag IDs (numbers) — for v1 we accept comma-separated names and resolve via `GET /categories?search=` + create-if-missing.

### 4. Settings UI: new `OrgWordPressConnectionCard`
Lives in Settings page, visible to org admins only. Clearly labelled **Organisation-wide** (vs the existing project-scoped Claude/Notion cards).

States:
- **Not connected** → "Connect WordPress" button → dialog
- **Connected** → site URL, flavour badge, "Disconnect" + "Edit defaults" buttons

Connect dialog:
```
○ WordPress.com
○ Self-hosted WordPress

[ if WordPress.com ]
  Site ID/domain:  [clientsite.wordpress.com]
  Access token:    [paste token] (link: how to generate)

[ if Self-hosted ]
  Site URL:        [https://clientblog.com]
  Username:        [admin]
  Application password: [xxxx xxxx xxxx xxxx]
                   (link: WP admin → Users → Profile → Application Passwords)

Default category: [...]
Default status:   ○ Draft  ● Publish

[Cancel]  [Test & Save]
```

"Test & Save" hits the validate endpoint before persisting — surfaces auth errors immediately.

### 5. Trim project-level WordPress settings
In `VisualStyleSettings.tsx` & `project_visual_settings`:
- `wordpress_site_id` becomes an **optional override** (used only if org has multiple sites and this project targets a different one — wp.com only)
- Show banner: "Org default: clientsite.wordpress.com — [override per project]"
- Keep `wordpress_default_category` / `wordpress_default_status` as project-level overrides over org defaults
- If org has no connection → disable WordPress fields with "Connect WordPress at organisation level first" link

### 6. Update `AssetPublishPanel`
- On mount, query `org_wordpress_connections` (via new RPC `get_my_org_wp_connection` returning safe fields only — no credentials)
- Show connection status + flavour badge above publish button
- If unconnected, show "Connect WordPress" link → Settings
- Drop dependency on workspace `WORDPRESS_COM_API_KEY` secret

### 7. Decommission workspace secret usage
- Remove `WORDPRESS_COM_API_KEY` and Lovable gateway calls from `publish-to-wordpress`
- Keep the secret defined (harmless) but no code path reads it

## Files

**New**
- `supabase/migrations/<ts>_org_wp_connections.sql` — table, enum, RLS, helper RPC for safe-read
- `supabase/functions/manage-org-wordpress-connection/index.ts`
- `src/components/settings/OrgWordPressConnectionCard.tsx`

**Modified**
- `supabase/functions/publish-to-wordpress/index.ts` — full rewrite (org-scoped, dual-flavour)
- `supabase/config.toml` — register new function
- `src/pages/Settings.tsx` — mount new card in admin section
- `src/components/settings/VisualStyleSettings.tsx` — site becomes override, show org banner
- `src/components/campaigns/AssetPublishPanel.tsx` — surface org connection status
- `src/types/database.ts` — types for `OrgWordPressConnection`, `WpFlavor`

## Self-hosted technical notes

- **Auth**: WordPress 5.6+ ships built-in **Application Passwords** (Users → Profile → Application Passwords). Sent as HTTP Basic. No plugin required. Works for blogs behind Cloudflare/normal hosting.
- **Endpoints used**:
  - `GET /wp-json/wp/v2/users/me` — validate credentials
  - `POST /wp-json/wp/v2/media` (multipart) — upload feature image, returns `{id, source_url}`
  - `GET /wp-json/wp/v2/categories?search=name` + `POST /categories` — resolve names → IDs
  - `GET/POST /wp-json/wp/v2/tags` — same for tags
  - `POST /wp-json/wp/v2/posts` — create post with `featured_media`, `categories[]`, `tags[]`, `status`, `slug`, `excerpt`, `meta` (Yoast meta if plugin installed)
- **CORS**: not an issue — calls happen server-side from edge function.
- **Failure modes**: invalid URL, wrong credentials, REST API disabled, self-signed cert. All surface as toast errors with HTTP status from WP.

## Auth approach (recommendation)

Use **manual credential entry** for both flavours in v1:
- WP.com → user pastes a personal OAuth token (instructions linked to https://developer.wordpress.com/docs/oauth2/)
- Self-hosted → user pastes username + application password

This ships now without OAuth callback infrastructure. A future OAuth-app flow for wp.com can be added without changing the data model — same `credential_secret_id` slot.

