## ProPresence Connection Wizard

A 4-step guided dialog that walks a project admin through connecting ProPresence without leaving Signal+Scale. Sits alongside the existing manual `PropresenceConnectionCard` — that card stays for users who already have a key handy.

ProPresence does not expose a programmatic signup or key-issuance endpoint (confirmed from their API docs — keys are generated manually under Account → API Access). So the wizard automates everything we *can* automate: opening the right page, validating the key, picking the target, and running a first sync. The user only has to copy-paste the key once.

### Entry point

In `src/pages/Settings.tsx`, under the existing ProPresence card:
- New secondary button **"Use setup wizard"** (only shown when not yet connected).
- Opens `<PropresenceSetupWizard projectId={...} />` dialog.

### Wizard steps

```text
[1 Intro] → [2 Generate key] → [3 Paste & validate] → [4 Choose target & finish]
```

**Step 1 — Intro**
- Explains what ProPresence is and what will be synced (brand voice + approved assets).
- "Do you already have a ProPresence account?" Yes → next. No → outbound link to `https://app.propresence.com.au` signup, then next when ready.

**Step 2 — Generate key**
- Big primary button **"Open ProPresence API Access"** → opens `https://app.propresence.com.au/account/api-access` (or closest URL) in a new tab.
- Inline screenshot/illustration + numbered steps: log in → Account → API Access → New Key → copy.
- Reminds them keys look like `ppk_live_...` and are shown once.

**Step 3 — Paste & validate**
- Password-masked input for the key with show/hide toggle.
- **Validate** button → calls existing `manage-propresence-connection` edge function in a new **dry-run / validate-only mode** (see Technical below). Shows spinner, then green check + "Key accepted" or red error with the ProPresence response.
- Cannot advance until validation passes.

**Step 4 — Target & finish**
- Radio: **Company** (default) / **Personal** with one-line explanation each.
- **Connect** button → calls `manage-propresence-connection` (POST) with key + target, which stores in Vault and sets `propresence_target`.
- On success → automatically fires `sync-tone-to-propresence` (existing function) so the first brand-voice sync is done as part of setup.
- Final screen: green success state showing connected target, last sync timestamp, and a "Done" button that closes the dialog and refreshes the underlying card.

Any step can be cancelled; nothing is persisted until Step 4 succeeds.

### Technical details

**New component**: `src/components/settings/PropresenceSetupWizard.tsx`
- Built with existing `Dialog` + a local `step` state (1–4).
- Uses the same `sonner` toast pattern, `lucide-react` icons, and design tokens already used in `PropresenceConnectionCard`.

**Edge function change**: `supabase/functions/manage-propresence-connection/index.ts`
- Add an optional `validate_only: true` flag to the POST body.
- When set, run only the existing key-validation step (GET `tone-api?target=...` with `X-API-Key`) and return `{ ok: true }` / `{ ok: false, error }` without touching Vault, `project_connections`, or `projects`.
- All other behaviour unchanged. No new function needed.

**No DB migration**. Reuses `project_connections` (provider=`propresence`), `projects.propresence_target`, and Vault storage that already exist.

**Settings page edit**: import and render `<PropresenceSetupWizard />` trigger button inside the existing ProPresence card section, gated on `state.connected === false`.

**Files**
- new: `src/components/settings/PropresenceSetupWizard.tsx`
- edited: `src/pages/Settings.tsx` (add wizard trigger)
- edited: `supabase/functions/manage-propresence-connection/index.ts` (add `validate_only` branch)

### Out of scope
- Auto-creating a ProPresence account (no API exists).
- Changing the existing manual card's behaviour.
- Any new tables, secrets, or RLS policies.
