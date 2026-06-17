# Fix "No matching properties" on Google connect

## Why it happened
Auto-match reads the project website from `brand_voices.brand_identity.website_url` (latest completed brand voice). If that's missing — or the host doesn't exactly match a GSC site / GA4 web stream URL — both fields are left null and the user has no way to fix it from the UI.

## What to build

### 1. New edge function: `analytics-list-properties`
- Auth: verify user JWT, confirm org access to the `project_id`.
- Load the stored Google tokens for that project, refresh if expired (reuse the refresh helper already in `analytics-fetch`).
- Returns:
  - `gscSites`: full list from `GET /webmasters/v3/sites` (siteUrl + permissionLevel).
  - `ga4Properties`: flattened list from `accountSummaries` (accountName, propertyId, propertyDisplayName, plus defaultUri from the first webStreamData lookup — cached per request).
  - `current`: the project's currently saved `gsc_site_url` and `ga4_property_id`.

### 2. New edge function: `analytics-save-selection`
- Auth + org check.
- Body: `{ project_id, gsc_site_url, ga4_property_id }` (either may be null).
- Updates `project_google_connections` row.

### 3. Analytics page UI changes (`src/pages/Analytics.tsx`)
- When a connection exists, add a small **Connection** card near the top showing:
  - Connected Google account email.
  - Two `Select` dropdowns: "Search Console property" and "GA4 property", populated from `analytics-list-properties`.
  - "Save" button → calls `analytics-save-selection`, then refetches analytics.
  - "Disconnect" button (already exists or add it) — deletes the row.
- If `gsc_site_url` or `ga4_property_id` is null, show an inline warning ("Auto-match couldn't find a property — pick one below").
- Keep the existing auto-match success badge.

### 4. Callback diagnostics (`google-oauth-callback`)
- Log counts: `gsc sites=N`, `ga4 properties=M`, and the `websiteHost` used for matching.
- When no website host is known (no completed brand voice with url), still succeed but show a clearer message: "Connected — please choose properties on the Analytics page."

## Out of scope
- No DB schema changes (table already has both columns).
- No new scopes (existing OAuth scopes already cover list endpoints).
- No change to `analytics-fetch`; it continues to read whatever ids are saved.

## Files
- create `supabase/functions/analytics-list-properties/index.ts`
- create `supabase/functions/analytics-save-selection/index.ts`
- edit `supabase/functions/google-oauth-callback/index.ts` (logging + message)
- edit `src/pages/Analytics.tsx` (Connection card with pickers)
