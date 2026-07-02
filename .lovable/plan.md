# Extend Ecosystem Sync with Discovery data

The `ecosystem-sync` edge function already pulls Discovery organisations, org-roles, contacts and leadership. This plan adds **themes** and **insights (quotes)** to the sync, and confirms orgs/contacts always reflect the latest Discovery state.

## Changes

### `supabase/functions/ecosystem-sync/index.ts`

1. **Fetch new sources** alongside existing queries:
   - `discovery_themes` for every `discovery_campaigns.id` in the project (`id, campaign_id, label, description, status`).
   - `discovery_conversations` joined via `discovery_contacts.id` (needed only to link insights → contact).
   - `discovery_insights` for every campaign id (`id, conversation_id, campaign_id, text, kind, is_quote, theme_id`).

2. **New node kind: `theme`** — placed on **ring 2** (between segments and companies) so themes sit near the segments/campaigns they belong to.
   - `ref_table = 'discovery_themes'`, label = `label`, subtitle = `status`.
   - Edge: `theme -belongs_to→ segment` for every ICP linked to the theme's campaign (via `discovery_campaigns.icp_ids`). If a campaign maps to multiple ICPs, one edge each.

3. **New node kind: `insight`** — placed on **ring 4** next to contacts, with a smaller visual weight.
   - `ref_table = 'discovery_insights'`, label = truncated `text` (e.g. first 80 chars), subtitle = `kind` (or "Quote" when `is_quote`).
   - Edges:
     - `insight -evidence_for→ contact` when the parent conversation has a `contact_id`.
     - `insight -supports→ theme` when `theme_id` is set.
   - `meta` carries `is_quote`, `kind`, `conversation_id`, `campaign_id`, full `text`.

4. **Refresh guarantees for existing kinds** — no logic change needed; the existing `existingKey`/`touched` diff + `hidden+stale` marking already ensures orgs and contacts reflect current Discovery state on every sync. Verified by re-reading the current loop.

5. **Sync counts** — extend the returned `counts` object with `themes` and `insights` so the toast in `src/pages/Ecosystem.tsx` can surface them.

### `src/pages/Ecosystem.tsx`

- Update the success toast to include the new counts: `… · N themes · M insights`.

### `src/components/ecosystem/EcosystemCanvas.tsx` and `NodeDrawer.tsx`

- Add rendering + drawer support for the two new node `kind`s (`theme`, `insight`): colour token, icon, and a drawer body that shows the theme description or the full insight text with a link back to `/project/discovery`.
- Extend the `TABLE_TO_ROUTE` map with `discovery_themes` and `discovery_insights` (both → `/project/discovery`).

## Not in scope

- No database schema changes — all required tables and columns already exist.
- No changes to manual node/edge handling; the existing `meta.synced=true` wipe/rebuild covers the new edges.
- Conversations themselves are **not** rendered as nodes (per your selection); they're only used to route insights to the correct contact.

## Technical notes

- New edge kinds: `evidence_for`, `supports`. If `ecosystem_edges.kind` is a free-text column these are fine; if it's an enum a migration will be needed — will confirm by reading the schema before implementing and, if needed, add an `ALTER TYPE ... ADD VALUE` migration.
- Insight labels are truncated for the canvas; full text lives in `meta.text` and is shown in the drawer.
- Ring 2 currently hosts companies; themes will share ring 2 but occupy their own angular slice (indices offset after companies) so they don't overlap.
