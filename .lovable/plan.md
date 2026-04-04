

# Brand Voice Module

A complete Brand Voice feature mirroring the ICP Wizard pattern: database table, edge function, wizard page, detail page, export button, and sidebar navigation.

## 1. Database Migration

**Single migration** with:

- **Add `slug` column to `projects`** — `text`, generated from name (lowercase, hyphens). Needed for the export filename. Populate existing rows with a trigger or default.
- **Create `brand_voices` table** — as specified, with RLS using the same `user_has_org_access` pattern.
- **Add `'brand_voice'` to `wizard_session_type` enum** so wizard sessions can track brand voice conversations.
- **RLS policies on `brand_voices`**: SELECT, INSERT, UPDATE for authenticated users via org access check on `project_id`.

Note: The spec uses a CHECK constraint for status — I'll use a validation trigger instead per Supabase guidelines.

## 2. Edge Function: `brand-voice-wizard`

**File**: `supabase/functions/brand-voice-wizard/index.ts`

Same structure as `icp-wizard`:
- Auth via JWT token validation
- Reads `ANTHROPIC_API_KEY` and `ANTHROPIC_BRAND_VOICE_SYSTEM_PROMPT` from env (the prompt secret will need to be set by the user separately)
- Creates/resumes `wizard_sessions` with `session_type: 'brand_voice'`
- Calls Claude claude-sonnet-4-6, max_tokens 2048
- Parses `<draft>` tags from response, merges into existing draft
- Upserts `brand_voices` record on each turn (status: `in_progress`)
- When `is_complete: true`, sets status to `complete`
- Returns `{ reply, updated_draft, session_id }`

**Config**: Add to `supabase/config.toml` with `verify_jwt = false`.

## 3. Navigation

**`AppSidebar.tsx`**: Add "Brand Voice" nav item between "ICP & Personas" and "Campaigns" with a `Mic` icon. Route: `/project/brand-voice`.

**`App.tsx`**: Add routes:
- `/project/brand-voice` — Brand Voice index page
- `/project/brand-voice-wizard` — Wizard page

## 4. Brand Voice Index Page

**File**: `src/pages/BrandVoice.tsx`

- Fetches `brand_voices` for current project
- **No record**: Empty state with "Define your brand voice" headline + "Start Brand Voice Wizard" CTA
- **Draft/in-progress record**: Summary card with status badge, personality adjectives as tags, "Continue" button (navigates to wizard with session resumption)
- **Complete record**: Summary card with status badge, personality tags, "View" button (navigates to detail page), "Export for Cowork" button

## 5. Brand Voice Wizard

**File**: `src/pages/BrandVoiceWizard.tsx`

60/40 split layout matching ICP Wizard:
- **Left (60%)**: Chat interface with message history, input, send button
- **Right (40%)**: Live preview panel showing brand voice sections populating

**Preview panel component**: `src/components/brand-voice-wizard/BrandVoicePreviewPanel.tsx`
- Sections: Personality, Tone, Writing Principles, Banned Phrases, Preferred Vocabulary, Formatting Rules, Content Type Guidance, Writing Samples, Target Audiences, Brand Identity
- Each section shows status indicators (empty/partial/complete)
- "Save Brand Voice" button appears when `is_complete: true`

**Types file**: `src/components/brand-voice-wizard/types.ts` — Draft interface and section definitions.

## 6. Brand Voice Detail Page

**File**: `src/pages/BrandVoiceDetail.tsx`

- Read-only view of completed brand voice
- Sections rendered as cards matching the preview panel layout
- Header actions: "Edit" (reopens wizard) + "Export for Cowork" (only when status = complete)

**Export logic**: Client-side JSON blob download using project slug as filename. After download, shows dismissible info banner with instructions.

## 7. TypeScript Types

**`src/types/database.ts`**: Add `BrandVoice` interface and update `WizardSessionType` to include `'brand_voice'`.

## Files to Create/Modify

| File | Action |
|------|--------|
| Migration SQL | Create `brand_voices` table, add `slug` to `projects`, add enum value |
| `supabase/functions/brand-voice-wizard/index.ts` | New edge function |
| `supabase/config.toml` | Add brand-voice-wizard config |
| `src/pages/BrandVoice.tsx` | New — index page |
| `src/pages/BrandVoiceWizard.tsx` | New — wizard page |
| `src/pages/BrandVoiceDetail.tsx` | New — detail/view page |
| `src/components/brand-voice-wizard/BrandVoicePreviewPanel.tsx` | New — preview panel |
| `src/components/brand-voice-wizard/types.ts` | New — types and section defs |
| `src/types/database.ts` | Add BrandVoice interface |
| `src/components/AppSidebar.tsx` | Add Brand Voice nav item |
| `src/App.tsx` | Add routes |
| `src/integrations/supabase/types.ts` | Will auto-update after migration |

## Secret Required

The user must set `ANTHROPIC_BRAND_VOICE_SYSTEM_PROMPT` as a Supabase edge function secret. The edge function will read it from env. A fallback system prompt will be hardcoded for development.

