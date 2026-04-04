---
name: API Key Management & Brand Voice Sync
description: API keys for external tools (Cowork) to pull brand voices via get-brand-voices edge function
type: feature
---
- `api_keys` table: stores SHA-256 hash + prefix (first 12 chars), never the raw key
- RLS: users can view/insert/delete only their own keys
- Settings page: ApiAccessCard component generates `gtm_`-prefixed keys, shows once, lists existing with revoke
- Edge function: `get-brand-voices` — GET only, API key auth (not JWT), returns completed brand voices for user's org
- `verify_jwt = false` in config.toml for this function
- Secret: `GTM_PLATFORM_URL` stores the endpoint URL
