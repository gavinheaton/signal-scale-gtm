

# ProPresence Integration

Connect Signal + Scale to ProPresence so brand voice and campaign content flow automatically downstream. Signal + Scale pushes; ProPresence receives.

## What you'll get

1. **Settings → ProPresence card** to connect, sync brand voice, and disconnect.
2. **Auto-sync brand voice** to ProPresence the moment it's marked complete.
3. **Per-asset "Push to ProPresence"** button in the asset drawer, with status badges (in ProPresence / push failed).
4. **Bulk "Push to ProPresence"** on the campaign detail header, mirroring the existing bulk Notion push.

## One decision needed before build

The spec stores the ProPresence API key as a plain text column on `projects`. The existing Notion/Claude integration stores keys in **Supabase Vault** via `project_connections` (encrypted, only readable by edge functions). I recommend the **Vault pattern** for consistency and security — same UX, same lifecycle, no plaintext keys in the table. If you want the literal spec instead I'll keep it as plain text. **Default in this plan: Vault.**

## Schema changes

```sql
-- projects: target + last-sync timestamp only (key lives in Vault via project_connections)
alter table projects
  add column if not exists propresence_target text default 'company'
    check (propresence_target in ('personal','company')),
  add column if not exists propresence_tone_synced_at timestamptz;

-- campaign_assets: push tracking
alter table campaign_assets
  add column if not exists propresence_id text,
  add column if not exists propresence_type text
    check (propresence_type in ('post','article')),
  add column if not exists propresence_pushed_at timestamptz,
  add column if not exists propresence_push_error text;

-- brand_voices: sync tracking
alter table brand_voices
  add column if not exists propresence_synced_at timestamptz;
```

`project_connections.provider` already accepts arbitrary text — we'll write rows with `provider = 'propresence'` reusing existing RLS and Vault helpers. (If you choose the plaintext-on-projects variant, we'll add `propresence_api_key text` instead and skip `project_connections`.)

## Settings page — ProPresence card

Added to `src/pages/Settings.tsx` next to the Notion card.

- **Not connected:** API Key input (placeholder `ppk_live_...`), Target dropdown (Personal / Company), **Connect** button. On submit, calls a new `manage-propresence-connection` edge function that validates the key via a lightweight ProPresence call (PUT tone with current values, or a GET if available), then stores it.
- **Connected:** green "Connected" badge, target type, "Last tone sync: …", **Sync brand voice now**, **Disconnect**.

## Edge functions

```text
supabase/functions/
├── manage-propresence-connection/   # connect, update target, disconnect (Vault-backed)
├── sync-tone-to-propresence/        # builds prose + PATCH refinements, updates timestamps
├── push-asset-to-propresence/       # single asset → post or article
└── bulk-push-campaign-to-propresence/  # all approved/published assets without propresence_id
```

All require JWT, follow the existing pattern (`getUser` for auth + service-role client for writes), and reuse the gateway base `https://rjkqibkujmykwnfxooop.supabase.co/functions/v1/`.

### Field mapping (spec → real schema)

The spec references several fields that don't exist on `campaign_assets`. Mapping used in `push-asset-to-propresence`:

| Spec field         | Real source                                                  |
|--------------------|---------------------------------------------------------------|
| `content_type`     | `asset_type` enum → `Article`/`Post`/`Video`/`Email`/etc.    |
| `body` / `body_html` | `content` (markdown). For articles, convert markdown → HTML; for posts, send raw text. |
| `channel`          | derived from `asset_type` (LinkedIn/Blog/Email/Podcast/…)    |
| `demand_type`      | `campaigns.track` → `Demand Creation (95%)` or `Demand Capture (5%)` |
| `campaign_name`    | `campaigns.name`                                             |
| `brief_url`        | `notion_url` (closest equivalent today)                      |

Long-form vs post detection:
```ts
const LONG_FORM = new Set(['blog','whitepaper','press_release','webinar']);
const isLongForm = LONG_FORM.has(asset.asset_type);
const endpoint = isLongForm ? 'articles-api' : 'api-v2-posts';
```

### `sync-tone-to-propresence` payload builders

Use exactly the spec's `buildToneText` + `buildStructuralPrefs`, adapted to our `brand_voices` shape (`personality_adjectives` text[], `writing_principles` jsonb[], `formatting_rules` text[], `preferred_vocabulary` jsonb[], `content_type_guidance` jsonb, `brand_identity` jsonb). PUT full tone, then PATCH refinements, then stamp `brand_voices.propresence_synced_at` and `projects.propresence_tone_synced_at`.

### Auto-sync trigger on brand-voice completion

In the brand voice wizard save handler (where status becomes `complete`), if the project has a ProPresence connection, fire-and-forget `sync-tone-to-propresence` and toast **"Brand voice synced to ProPresence."** No DB trigger — keep it in the client handler for transparency and easy debugging.

## UI — asset & campaign push

**Asset drawer (`AssetDetailDrawer.tsx`):** add a "Push to ProPresence" button next to the existing "Push to Notion" / "Email content" buttons.
- Disabled with tooltip if project not connected.
- After push: replace with a purple **In ProPresence** badge + external-link button to `https://app.propresence.com.au`.
- On `propresence_push_error`: red **Push failed** badge + **Retry** button (shows error in a tooltip).

**Asset pipeline rows (`ContentPipeline.tsx`):** small ProPresence dot/badge in the status column when `propresence_pushed_at` is set.

**Campaign detail header:** new **Push to ProPresence** button beside the existing Notion bulk push. Calls `bulk-push-campaign-to-propresence` which iterates `status in ('approved','published') and propresence_id is null`. Inline progress: "Pushing 3 of 7 assets…", final toast with counts of successes/failures.

## Files

**New**
- `supabase/migrations/<timestamp>_propresence_integration.sql`
- `supabase/functions/manage-propresence-connection/index.ts`
- `supabase/functions/sync-tone-to-propresence/index.ts`
- `supabase/functions/push-asset-to-propresence/index.ts`
- `supabase/functions/bulk-push-campaign-to-propresence/index.ts`
- `src/components/settings/PropresenceConnectionCard.tsx`

**Modified**
- `src/pages/Settings.tsx` — mount the new card
- `src/types/database.ts` — add new columns to `CampaignAsset`, `Project`, `BrandVoice`
- `src/components/campaigns/AssetDetailDrawer.tsx` — push button + status badges
- `src/components/campaigns/CampaignJourneyView.tsx` (campaign header) — bulk push button + progress
- `src/pages/ContentPipeline.tsx` — small "In ProPresence" indicator on rows
- Brand-voice wizard save handler (whichever file calls the wizard's complete step) — fire `sync-tone-to-propresence` on completion

## Notes

- The Lovable AI gateway / Brevo / Notion patterns already in the repo are mirrored exactly here (JWT verify in code, service-role for writes, `corsHeaders`).
- All four new edge functions deploy automatically; no `config.toml` change needed.
- No new runtime secrets — the per-project ProPresence API key is the only credential and it lives in Vault.
- Bulk push is sequential with a small concurrency cap (3) to avoid rate-limit surprises on the ProPresence side.

