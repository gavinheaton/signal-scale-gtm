

# Create Campaign Wizard Edge Function

## Database Change
Add `notion_url` text column and `context` jsonb column to `wizard_sessions`, and add `'campaign'` to the `wizard_session_type` enum.

```sql
ALTER TYPE public.wizard_session_type ADD VALUE IF NOT EXISTS 'campaign';
ALTER TABLE public.wizard_sessions ADD COLUMN IF NOT EXISTS notion_url text;
ALTER TABLE public.wizard_sessions ADD COLUMN IF NOT EXISTS context jsonb DEFAULT '{}'::jsonb;
```

## Edge Function: `supabase/functions/campaign-wizard/index.ts`

Follows the icp-wizard pattern with these differences:

1. **Request body**: accepts `{ message, session_id, project_id, project_context }` where `project_context` is `{ icp_segments: [...], personas: [...] }`
2. **Session creation**: stores `project_context` in the new `context` jsonb column
3. **System prompt**: reads `ANTHROPIC_CAMPAIGN_SYSTEM_PROMPT` from env (Supabase secret). Prepends `"## PROJECT CONTEXT\n" + JSON.stringify(project_context)` before the base prompt
4. **Draft parsing**: identical `<draft>` tag extraction and `mergeDrafts` logic
5. **Notion integration**: when `updatedDraft.is_complete === true && updatedDraft.notion_brief_ready === true`, invokes `create-notion-campaign-brief` edge function, stores returned `notion_url` in the session record
6. **Response**: returns `{ reply, updated_draft, session_id, notion_url }`

### Key flow differences from icp-wizard:
- No URL fetching/crawling (campaign wizard uses structured project context instead)
- No brand context loading from projects table
- Loads `project_context` from session's `context` column on subsequent messages
- Calls `create-notion-campaign-brief` via internal fetch when both completion flags are set

## Config Update: `supabase/config.toml`

Add:
```toml
[functions.campaign-wizard]
  verify_jwt = false
```

## Secret Required

`ANTHROPIC_CAMPAIGN_SYSTEM_PROMPT` must be added as a Supabase secret. Will prompt the user for this value.

## Files Modified/Created
- **Migration**: add `notion_url`, `context` columns + enum value
- **Create**: `supabase/functions/campaign-wizard/index.ts`
- **Edit**: `supabase/config.toml` — add function entry
- **Edit**: `src/integrations/supabase/types.ts` — auto-updated after migration

