## Goal
Declutter the Analytics page by relocating Google connection setup (connect button, status badges, property pickers) to Settings. Analytics keeps only the data view plus a small inline prompt if nothing is configured.

## Changes

### 1. New `src/components/settings/GoogleAnalyticsConnectionCard.tsx`
Self-contained Settings card. Encapsulates everything currently in the Analytics connection block:
- Fetches connection state from `analytics-fetch` (or a lightweight call) for `currentProject`
- "Connect Google" / "Reconnect" button — invokes `google-oauth-start`, opens popup, listens for `postMessage` (same logic as Analytics today)
- Status row: connected email, GSC site badge, GA4 property badge (amber when missing)
- Embeds existing `PropertyPicker` below when connected
- Gated by `canManageConnections` (hasMinRole 'admin'), matching siblings

### 2. `src/pages/Settings.tsx`
Import and render `GoogleAnalyticsConnectionCard` alongside the other connection cards (after `OrgWordPressConnectionCard`, before `VisualStyleSettings`).

### 3. `src/pages/Analytics.tsx`
- Remove the Connection card (lines ~163–195) and the inline `PropertyPicker` (line 197)
- Remove unused imports (`AlertCircle`, `LinkIcon`, `CheckCircle2`, `Badge`, `PropertyPicker`) and `connecting` state + `handleConnect`
- Keep popup/redirect `postMessage` listeners so a successful connection from Settings (if user opens Analytics in another tab) still refreshes — actually these can stay simplified
- When `data.connected` is false OR properties are missing, replace the big chart area placeholder with a compact inline notice:
  > "Connect Google Search Console and GA4 in **Project Settings → Connections** to see data here." with a `Link` to `/project/settings`
- Header (title + date range + refresh) and all charts stay unchanged

### 4. No backend / edge function / DB changes
Pure UI relocation. `analytics-fetch`, `analytics-list-properties`, `analytics-save-selection`, `google-oauth-*` untouched.

## Out of scope
- No changes to data fetching, OAuth flow, or property selection logic
- No changes to other Settings cards
