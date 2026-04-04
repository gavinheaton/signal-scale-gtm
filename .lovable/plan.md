

# Update Integration Help Page with API Access / Brand Voice Sync

## What
Add a new "API Access (Cowork Sync)" section to the Integration Help page explaining how to generate API keys and use the brand voice sync endpoint.

## Changes

### `src/pages/IntegrationHelp.tsx`

Add a new Card between the Notion card and the Troubleshooting card:

**API Access (Cowork Sync) section** with a `Key` icon:
- Description: "Allows external tools like Cowork to pull your completed brand voice data via API."
- Setup steps:
  1. **Go to Settings → API Access** — link to `/project/settings`
  2. **Generate an API Key** — click "Generate API Key". The key (prefixed `gtm_`) is shown once in a modal. Copy it immediately — it cannot be retrieved later.
  3. **Configure Cowork** — in Cowork, paste the key as a Bearer token. The endpoint is `GET /functions/v1/get-brand-voices` with header `Authorization: Bearer gtm_xxxxx`.
  4. **Verify the sync** — Cowork will pull all completed brand voices from your organisation's projects automatically.
- Note box: "You can revoke a key at any time from Settings → API Access. Revoking a key immediately blocks all requests using it."

Also add a new troubleshooting accordion item:
- **"unauthorized" when calling the brand voice API** — The API key is invalid, revoked, or missing. Generate a new key in Settings → API Access and update the Bearer token in Cowork.

Add `Key` to the lucide-react import.

## Files changed
1. `src/pages/IntegrationHelp.tsx` — add API Access card + troubleshooting item

