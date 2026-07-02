# ICP Wizard — Diff Mode for Additional ICPs

Mirror the pattern already shipped in the Persona Wizard so that when a project already has one or more ICPs, the AI reuses that context instead of re-asking every question.

## Behaviour

- **First ICP in a project:** unchanged — full 6-section discovery flow.
- **Second+ ICP:** wizard opens by summarising what's already known across existing ICPs and asks whether the new segment is:
  1. A **variation** of an existing ICP (e.g. same firmographics, different geo/stage) — inherit matching sections, only probe the deltas.
  2. A **new segment** — still inherit anything shared at the project/brand level (buying culture norms, anti-ICP patterns the company has learned, common buyer roles) so those aren't re-asked from zero.
- Quick-reply chips in the chat: "Variation of <existing segment>", "New segment", "Skip — ask me everything".
- Sections auto-marked as inherited appear as `partial` in the preview panel with an "Inherited from <segment>" tag; user can edit or confirm.

## Where the changes land

### Edge function — `supabase/functions/icp-wizard/index.ts`
- On session init, fetch all existing `icps` rows for `project_id` (segment_name, firmographics, psychographics, buyer_roles, anti_icp_signals, matrix_category, fit/access scores).
- If any exist, inject an **Existing ICP Context** block into the system prompt with a compact JSON summary + instruction: "Do not re-ask questions already answered by existing ICPs unless the user says this new segment differs. Start by proposing what to inherit and confirming the delta."
- Add an `existing_icp_count` field to the response so the UI can render chips on turn 1.

### Shared prompt — `supabase/functions/_shared/defaultPrompts.ts`
- Extend `ICP_SYSTEM_PROMPT` with a **Diff Mode** section describing the inheritance rules, delta-first questioning, and the requirement to tag inherited sections in the draft (`inherited_from: <icp_id>` per section).
- Bump/import via the existing AI Prompt Management system so admins can tune it without redeploying.

### Draft type — `src/components/icp-wizard/types.ts`
- Add optional `inherited_sections?: Record<string, string>` (section key → source ICP id) on `DraftOutput`.

### UI — `src/pages/ICPWizard.tsx` + `ICPPreviewPanel.tsx`
- On mount, if `existing_icp_count > 0`, render quick-reply chips above the composer: one per existing segment ("Variation of <name>") plus "New segment" and "Ask me everything".
- Preview tiles show an "Inherited" pill when `inherited_sections[key]` is set, with the source segment name in a tooltip.
- No schema/DB migration required — `icps` already stores everything needed; inheritance metadata lives only in the wizard session draft.

## Out of scope

- No changes to how saved ICPs are stored or scored.
- No bulk-edit or cross-ICP refactor UI (can follow later if useful).
- Persona wizard already has the equivalent behaviour — leaving it as-is.
