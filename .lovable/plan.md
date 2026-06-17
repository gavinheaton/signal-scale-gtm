## Goal

Replace (or augment) the placeholder charts on `/analytics` with real data pulled from Google Search Console and Google Analytics 4, scoped per project, auto-matched to the project's website URL.

## Architecture

```text
Browser /analytics
   │
   ▼
Edge fn: analytics-fetch            ◄── reads stored OAuth tokens per project
   │                                    auto-selects GSC site & GA4 property
   ├─► GSC: searchanalytics.query (impressions, clicks, queries, pages)
   └─► GA4 Data API: runReport      (sessions, sources, conversions, engagement)

Edge fn: google-oauth-callback      ◄── exchanges code → tokens, stores per project
Edge fn: google-oauth-start         ◄── builds consent URL with project state
```

Per-project OAuth (rather than the workspace connector) because each client needs to grant their own account, and GA4 has no Lovable connector.

## Integrations

**Google Search Console** — already available as a Lovable workspace connector (gateway-backed). We will NOT use the agency connector here because the user picked "per project / per client". Instead we'll register one Google OAuth Client (single set of credentials shared by all clients) and ask each client to authorize their own Google account.

**Google Analytics 4** — no Lovable connector exists; per-project OAuth is the only option. Same OAuth client handles both APIs (scopes combined).

## Step 1 — Google Cloud project & OAuth client (one-time, user-side)

User creates an OAuth 2.0 Web Client in Google Cloud Console with:
- Scopes: `webmasters.readonly`, `analytics.readonly`, `userinfo.email`
- Authorized redirect URI: `https://xiufgczyecwgnkbyroow.supabase.co/functions/v1/google-oauth-callback`
- Enabled APIs: Search Console API, Google Analytics Data API

Stores client ID + secret as Supabase secrets: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`.

## Step 2 — Database

New table `project_google_connections` (per-project token storage):

```text
id uuid PK
project_id uuid → projects (unique)
google_email text
access_token text
refresh_token text
expires_at timestamptz
gsc_site_url text         -- auto-matched, user-overridable later
ga4_property_id text      -- auto-matched, user-overridable later
connected_at, updated_at
```

RLS via existing org membership pattern. Tokens are sensitive but acceptable in DB encrypted-at-rest; alternative is Vault, more setup.

## Step 3 — Edge functions

1. `google-oauth-start` — builds Google consent URL with `state = project_id + nonce`, returns it.
2. `google-oauth-callback` — exchanges code, stores tokens, then calls GSC `sites.list` + GA4 `accountSummaries.list`, picks the entry whose URL host matches the project's website URL (from latest completed `brand_voices.brand_identity.website_url`), saves to `gsc_site_url` / `ga4_property_id`. Redirects back to `/analytics?connected=1`.
3. `analytics-fetch` — refreshes token if expired, runs:
   - GSC `searchanalytics.query` for date range, dimensions `date`, `query`, `page`
   - GA4 `runReport` for `sessions`, `engagedSessions`, `conversions` by `date` and `sessionDefaultChannelGroup`
   Returns a normalized JSON payload.

## Step 4 — Analytics page UI

- Top: connection card. If no `project_google_connections` row → "Connect Google" button → opens `google-oauth-start` URL in popup. After callback, show connected email + matched site/property.
- Real charts replace placeholders:
  - **Brand Search Volume** — GSC impressions for queries containing brand name (line, weekly)
  - **Inbound Referrals** — GA4 sessions where channel = Referral / Organic Social (bar, weekly)
  - **Pipeline Influenced** — kept from `campaign_metrics` (no Google source)
  - **Share of Voice** — GSC clicks / total category impressions estimate (gauge)
  - **Top Queries / Top Pages** — new tables from GSC
  - **Traffic by Channel** — GA4 stacked area
- Date range selector (7d / 28d / 90d), campaign selector retained.

## Step 5 — Auto-matching logic

On callback and on a manual "Re-match" button:
1. Pull `website_url` from latest completed brand voice for the project.
2. Normalize to host (strip `www.`, protocol).
3. GSC: pick site whose host matches (prefer `sc-domain:` property if present, else `https://host/`).
4. GA4: list properties via `accountSummaries.list`, pick property whose `defaultUri` host matches.
5. If no match, leave null and surface a Settings link (future) so the user can pick manually.

## Out of scope (this round)

- Tag Manager (user deferred).
- Manual GSC/GA4 picker UI (auto-match only; we'll add a picker later if mismatches are common).
- Historical backfill beyond what the APIs return (GSC ~16 months, GA4 from property start).

## Technical notes

- Token refresh: standard `oauth2/v4/token` with `grant_type=refresh_token`; do in `analytics-fetch` if `expires_at < now() + 60s`.
- All Google calls go direct to `googleapis.com` (no gateway), authed with the per-project access token.
- New runtime secrets needed: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` (added via `add_secret` after user confirms).
- No changes to existing brand audit, campaign, or ICP code paths.

## What I need from you to start building

1. Confirm you're OK creating the Google Cloud OAuth client (I'll give exact steps).
2. Confirm storing OAuth tokens in a Supabase table (RLS-protected) is acceptable vs. Vault.