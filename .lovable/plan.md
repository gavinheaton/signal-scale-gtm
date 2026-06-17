# Diagnose "0 GSC sites / 0 GA4 properties"

## Suspected cause
Logs from the most recent connect:
```
auto-match websiteHost= null
GSC sites=0, matched=null
GA4 properties=0, matched=null
```

Two plausible reasons, indistinguishable from current logs:
1. **Granular scopes not granted** — Google's consent screen now shows one checkbox per scope (`webmasters.readonly`, `analytics.readonly`). If the user didn't tick them, the access token is issued but the list endpoints return empty/403. This is the most common cause.
2. **Account has no GSC/GA4 access** — the signed-in Google account genuinely owns no properties (or they're under a different account).

## What to add

### 1. Log granted scopes in `google-oauth-callback`
After token exchange, log `tokens.scope` (Google returns the actual granted scope string). If `webmasters.readonly` or `analytics.readonly` is missing, **don't save the connection** — return a clear error: "You declined the Search Console / Analytics permission. Reconnect and tick both boxes."

### 2. Surface API errors in `analytics-list-properties`
Currently the function silently returns empty arrays on API errors. Change it to also return:
- `gscError`: HTTP status + Google error message if `/sites` fails
- `ga4Error`: same for `/accountSummaries`
- `grantedScopes`: from a `tokeninfo` lookup so the UI can show what was actually granted

### 3. Show diagnostics in the PropertyPicker UI
When both lists are empty, render an inline alert that shows:
- The Google account email
- The granted scopes
- Any API error returned
- A "Reconnect" button that re-runs the OAuth flow

## Files
- edit `supabase/functions/google-oauth-callback/index.ts` (scope check + early fail)
- edit `supabase/functions/analytics-list-properties/index.ts` (return errors + granted scopes)
- edit `src/components/analytics/PropertyPicker.tsx` (diagnostics alert)
