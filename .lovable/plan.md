## Goal

When building a second (or later) persona in a project, the Persona Wizard should reuse everything it already knows — shared company facts, the selected ICP's context, and prior personas — and only ask about what genuinely differs. The user should first pick which ICP the new persona belongs to, then be asked whether it's similar to an existing persona so the AI can scope its questions accordingly.

## Changes

### 1. ICP picker before entering the wizard

- On `/project/icp-personas` Personas tab, "+ Add Persona" opens a small dialog listing the project's ICPs (segment name + matrix category). User selects one → navigate to `/project/persona-wizard?icp_id=…`.
- The existing "Build Another Persona" button on the wizard's post-save screen also routes through this picker instead of restarting silently against the previous ICP.
- Direct navigation to `/project/persona-wizard` with no `icp_id` shows the picker inline first.

### 2. Wizard loads a full "known context" bundle

Before the first AI turn, the edge function loads:

- **Company facts** — from the project's `brand_voices.brand_identity` (website URL, product, positioning, industry) and the project record itself.
- **Selected ICP** — firmographics, psychographics, buyer roles, anti-ICP signals, matrix category.
- **Prior personas in the same ICP** — full persona records (name, role_in_buying, goals, pains, channels, how_we_help).
- **Other personas in the project** — condensed summary (name, role, ICP segment) so the AI can reference them without re-asking.

This bundle is injected into the system prompt as a `<known_context>` block with an explicit rule: "Never ask the user for anything already stated here. Reuse it silently or state it back for confirmation. Treat 'no website' or similar prior answers as authoritative."

### 3. "Similar to existing persona?" opening turn

If the selected ICP already has ≥1 saved persona, the wizard's opening message:

- Lists existing personas in that ICP as chips (e.g. "VP Marketing · Champion", "Head of Ops · Economic Buyer").
- Asks: *"Is the new persona similar to one of these, a variation, or completely different?"*
- Offers three quick-reply options rendered as buttons above the textarea: **Similar to [persona]**, **Variation of [persona]**, **Different role**.

Based on the reply, the AI generates a tailored question set:

- **Similar** → prefill draft from the chosen persona, ask only what differs (seniority, region, sub-function). ~2–3 targeted questions.
- **Variation** → prefill shared fields (org context, some pains, channels), ask about the differentiators. ~4–5 questions.
- **Different role** → keep org/company facts, ask fresh questions about goals/pains/buying behaviour for the new role. Still skips company-level questions.

### 4. Prefill the draft panel on load

For "Similar" / "Variation" flows, the returned `updated_draft` on the first turn is prefilled from the source persona so the right-hand preview panel is populated from message one. The user can edit inline or let the chat refine it.

### 5. First-persona flow unchanged

If it's the project's first persona (no prior personas exist), the wizard behaves exactly as today — full guided flow. Company facts from `brand_voices` are still injected so it won't ask "what is your website" when a brand voice exists.

## Technical details

**Files touched:**

- `src/pages/ICPPersonas.tsx` — add ICP picker dialog for "+ Add Persona".
- `src/pages/PersonaWizard.tsx` — handle post-save "Build Another Persona" via picker; render existing-persona quick-reply chips on first assistant turn when applicable; render inline picker if `icp_id` missing.
- `supabase/functions/persona-wizard/index.ts`:
  - New `loadKnownContext(project_id, icp_id)` helper — fetches brand_voices, icps, personas in one parallel batch.
  - Inject `<known_context>` and `<existing_personas_in_icp>` blocks into system prompt.
  - New init-mode branch: if prior personas exist for this ICP and no user message yet, first assistant turn asks the similarity question with structured suggestions.
  - When user picks "Similar"/"Variation of [X]", prefill `updated_draft` from persona X (minus name/role) and switch the system prompt into "diff mode" — instructs AI to only ask what differs.
- No schema changes. No new tables.

**Prompt template:** update the `persona_wizard` entry in `ai_prompt_templates` (via the admin panel) with new rules for context reuse and diff-mode. The edge function's hardcoded default in `_shared/defaultPrompts.ts` also gets these rules so it works before an admin edits the template.

**No changes to:** save logic, `personas` table shape, sidebar, other wizards.
