# Notion Strategy Sync

Adds a strategy-page sync layer on top of the existing Notion integration. The existing Vault-stored token (`project_connections.provider='notion'`) is reused — no plaintext key in `projects`. The adopt/workspace flow for the content calendar stays untouched.

## 1. Database migration

```sql
alter table projects
  add column if not exists notion_strategy_page_id text,
  add column if not exists notion_strategy_synced_at timestamptz;
```

No RLS changes — `projects` policies already cover these columns. No new GRANTs needed.

## 2. Settings UI — new "Notion Strategy Page" card

New card in `src/pages/Settings.tsx`, placed under the existing "Notion Workspace" card (additive, separate concern). Contains:

- Read-only banner if `connections.notion` is false — "Add your Notion token in Connections above first".
- Input: **Strategy Page ID** (`notion_strategy_page_id`), placeholder `32-character page ID from the Notion URL`, accepts pasted URL and extracts the ID client-side.
- **Test connection** button → calls a new `test-notion-strategy-page` edge function with `{ project_id }`. Resolves the token from Vault, calls `GET /v1/pages/{page_id}`, returns `{ ok, title }` or `{ error }`. Toast result.
- **Save** button → updates `projects.notion_strategy_page_id` via the supabase client (RLS allows admin/owner update of own org projects).
- Read-only "Last synced" line showing `notion_strategy_synced_at` formatted relative ("2 minutes ago") or "Never".
- **Sync now** button (only when page ID saved) — calls `sync-strategy-to-notion`.

## 3. Edge function — `sync-strategy-to-notion`

`supabase/functions/sync-strategy-to-notion/index.ts`. POST `{ project_id }`. JWT verified in code via the existing pattern.

Flow:
1. Auth caller → check `user_has_org_access` to project's org.
2. Load project (name, `notion_strategy_page_id`). Resolve token via existing `resolveNotionKey` helper in `_shared/notion.ts`.
3. Load ICPs (`icps` where `project_id`), brand voice (`brand_voices` where `status='complete'`, latest), active campaigns (`campaigns` where `status in ('planning','active')`).
4. **Clear page children**: list children via `GET /v1/blocks/{page_id}/children` (paginated), then `DELETE /v1/blocks/{block_id}` for each existing child. (Notion has no bulk replace; this is the standard idempotent pattern.)
5. **Append fresh blocks** via `PATCH /v1/blocks/{page_id}/children` (batch ≤100 blocks per call):
   - `heading_1`: "Strategy artefacts — {project.name}"
   - `divider`
   - `heading_2`: "Ideal customer profiles"
   - For each ICP: `heading_3` (segment_name), `paragraph` (firmographics summary), `paragraph` (pain points from psychographics), `paragraph` (fit signals from anti_icp_signals + scores).
   - `divider`
   - `heading_2`: "Brand voice" + paragraphs (tone, personality adjectives, banned phrases, writing principles — read from `brand_voices` JSON fields).
   - `divider`
   - `heading_2`: "Active campaigns" + per-campaign heading_3 + paragraphs (objective, target ICPs resolved to names, launch_date → end_date).
6. `update projects set notion_strategy_synced_at = now()`.
7. Return `{ success: true, synced_at }`.

Errors return `{ error }` with appropriate status; CORS headers on every response (incl. preflight allowing POST + OPTIONS).

## 4. Edge function — `import-from-notion`

`supabase/functions/import-from-notion/index.ts`. POST `{ project_id }`.

1. Auth + token resolution as above.
2. Recursively `GET /v1/blocks/{id}/children` starting from `notion_strategy_page_id`, following `has_children` blocks (depth cap 5, total block cap 2000 to avoid runaway pages).
3. Flatten to plain text — heading levels prefixed with `#`/`##`/`###`, paragraphs as lines, bulleted_list_item as `- `.
4. Call Anthropic (`ANTHROPIC_API_KEY` already configured) with a strict extraction system prompt; ask for raw JSON only matching:
   ```json
   {
     "icps": [{ "name": "", "company_size": "", "industry": "", "pain_points": [], "goals": [] }],
     "brand_voice": { "tone_description": "", "personality_adjectives": [], "banned_phrases": [], "writing_principles": [] },
     "content_pillars": []
   }
   ```
5. Parse and return as-is. No DB writes. Return `{ extracted, source_chars }`.

## 5. Auto-sync on wizard completion

Add a tiny helper `src/lib/syncStrategyToNotion.ts`:
```ts
export function triggerStrategySync(projectId: string) {
  supabase.functions.invoke('sync-strategy-to-notion', { body: { project_id: projectId } })
    .catch(() => { /* silent — fire and forget */ });
}
```

Call it (no `await`) at the success path in:
- `src/pages/ICPWizard.tsx`
- `src/pages/BrandVoiceWizard.tsx`
- `src/pages/CampaignWizard.tsx`

Guard: only fire if `currentProject.notion_strategy_page_id` is set.

## 6. Manual "Sync to Notion" button on project header

Add to the project dashboard header. Closest match in the current codebase is `src/pages/Home.tsx` (the per-project landing). Add a button next to existing project header actions:
- Visible only when `currentProject.notion_strategy_page_id` is set.
- Loading spinner while invoking.
- Success: toast "Strategy synced to Notion" with an "Open" action linking to `https://notion.so/{page_id_without_dashes}`.
- Error: toast with the returned message.

## 7. Import-from-Notion UI

New shared component `src/components/notion/NotionImportDialog.tsx`:
- Trigger button (secondary style) — only rendered when `notion_strategy_page_id` is set.
- On open: invokes `import-from-notion`, shows skeleton while loading.
- Preview panel: ICPs listed by name with expandable details, brand voice summary block, content pillars as bullet list.
- **Confirm and import**: writes records to Supabase:
  - `icps`: insert one row per extracted ICP, mapping `name → segment_name`, `pain_points`/`goals` into `psychographics` jsonb, `company_size`/`industry` into `firmographics` jsonb. Default `fit_score`/`access_score` to 50, `matrix_category` to `strategic_nurture`.
  - `brand_voices`: insert one row with `status='draft'` so user can review in the wizard before marking complete.
  - `content_pillars`: stored on the new brand_voice row's existing JSON field if present, otherwise dropped with a toast note. (Confirm field exists during implementation; if not, hold pillars in component state for a follow-up.)
- **Cancel**: closes dialog, no writes.

Mount the trigger on:
- `src/pages/ICPPersonas.tsx` (ICP tab toolbar).
- `src/pages/BrandVoice.tsx` (header actions).

## 8. Verification

- Migration applied; `select notion_strategy_page_id, notion_strategy_synced_at from projects limit 1` works.
- Settings → Save page ID → Test connection returns OK for a real page shared with the integration.
- Sync Now writes the expected block tree (manual eyeball in Notion).
- Re-running Sync Now does not duplicate blocks (clear-then-append).
- Wizard completion fires the background call (network tab shows 200).
- Import dialog returns parsed JSON, Confirm creates rows visible in ICP list.

## Files touched

**New**
- `supabase/migrations/<ts>_notion_strategy_page.sql`
- `supabase/functions/sync-strategy-to-notion/index.ts`
- `supabase/functions/import-from-notion/index.ts`
- `supabase/functions/test-notion-strategy-page/index.ts`
- `src/lib/syncStrategyToNotion.ts`
- `src/components/settings/NotionStrategyPageCard.tsx`
- `src/components/notion/NotionImportDialog.tsx`

**Modified**
- `src/pages/Settings.tsx` (mount new card)
- `src/pages/Home.tsx` (Sync to Notion button)
- `src/pages/ICPPersonas.tsx` (Import button)
- `src/pages/BrandVoice.tsx` (Import button)
- `src/pages/ICPWizard.tsx`, `src/pages/BrandVoiceWizard.tsx`, `src/pages/CampaignWizard.tsx` (background sync trigger)
