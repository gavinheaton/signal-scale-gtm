## Adopt + upgrade existing ProPresence Notion workspace

Goal: connect the project to your existing `ProPresence Workspace Template` page instead of building a new one. Discover what's already there, only add what's missing, and map our app's expected fields to whatever properties you already use — no overwriting, no duplicate databases.

### 1. Connect Notion (per-project key)
Already built last turn. You'll paste your Notion internal-integration token (created in the ProPresence workspace, shared with the template page) into **Settings → Notion**. Stored in Vault, scoped to this project.

### 2. New flow: "Adopt existing workspace"
On the Notion settings card, in addition to **Setup new workspace**, add **Adopt existing workspace**:

1. You paste the URL of the parent page (`ProPresence Workspace Template ...`).
2. New edge function **`discover-notion-workspace`** does a read-only scan:
   - Pulls the page via `/blocks/{id}/children` (recursive, depth 2).
   - Collects every child database with its `id`, `title`, and full `properties` schema.
   - Returns a manifest: `{ parent_page_id, databases: [{ id, title, properties: [{name, type, options?}] }] }`.
3. We auto-match by title (case-insensitive, fuzzy): `Content Calendar`, `Content Pillars`, `Strategic Foundations`, plus per-channel calendars (`LinkedIn Calendar`, etc.).
4. UI shows the manifest with three states per expected DB:
   - ✅ Found → preselected
   - ❓ Ambiguous → dropdown of candidates
   - ❌ Missing → checkbox "Create this database"

### 3. Property mapping
For each adopted DB, show a mapping table:

```text
App field         │ Type       │ Your property
──────────────────┼────────────┼─────────────────────────
Title             │ title      │ [auto: "Name" / "Content"]
Status            │ select     │ [dropdown of your selects]
Channel           │ select     │ [dropdown]
Publish Date      │ date       │ [dropdown]
Pillar (relation) │ relation   │ [dropdown of relations]
...
```

- Auto-suggest by exact/fuzzy name match.
- "— Not mapped —" is allowed; that field is simply omitted when pushing.
- Saved as `notion_property_map jsonb` on the project (per DB).

### 4. "Upgrade in place" (optional, opt-in)
A separate **Add missing pieces** button does only additive work:
- For each expected DB you didn't adopt and didn't already have, create it (existing setup logic, scoped to just that DB).
- Append missing top-level sections (e.g. "Ideas" heading, sidebar) only if not already present (detected by heading text scan).
- Never modifies existing databases' schemas, never deletes blocks, never edits existing pages.

### 5. Push functions respect the map
All push paths (`push-asset-to-notion`, `add-campaign-to-notion`, `bulk-push-campaign-to-notion`, `create-notion-campaign-brief`, `check-notion-sync`) read `notion_property_map` for the target DB and translate app fields → your property names. Unmapped fields are skipped silently with a debug log.

### 6. Schema changes
Migration adds to `projects`:
- `notion_parent_page_id text` — your ProPresence template page id
- `notion_property_map jsonb` — `{ calendar: {Status: "Status", Channel: "Platform", ...}, pillars: {...}, foundations: {...} }`
- `notion_channel_db_ids jsonb` — `{ LinkedIn: "...", Email: "...", ... }` for per-channel calendars

Keeps existing `notion_calendar_db_id`, `notion_pillars_db_id`, `notion_foundations_db_id`, `notion_workspace_id`.

### 7. Files

**New**
- `supabase/functions/discover-notion-workspace/index.ts`
- `src/components/settings/NotionAdoptWorkspaceDialog.tsx` (paste URL → manifest → mapping UI → save)
- `supabase/migrations/<ts>_notion_adopt.sql`

**Modified**
- `src/components/settings/NotionConnectionCard.tsx` (add "Adopt existing" button + "Add missing pieces" button)
- 5 Notion push edge functions (read `notion_property_map`, translate field names)
- `setup-notion-workspace` (new `mode: "missing_only"` branch that skips existing DBs)

### 8. Safety guarantees
- Discovery is **read-only** — no writes happen until you confirm in the mapping UI.
- Adopt path **never** creates databases inside your existing ones; it only saves IDs.
- "Add missing pieces" is opt-in per item with explicit checkboxes.
- Your existing content, properties, and views are never touched.

### Open question (will ask after approval if needed)
Per-channel calendars in your template — if you don't have them but the app expects them, do you want a single Content Calendar + filtered views (recommended; we just save the same ID for all channels), or separate per-channel DBs created fresh? Most ProPresence templates use the single-DB pattern, so default is **shared single DB**.