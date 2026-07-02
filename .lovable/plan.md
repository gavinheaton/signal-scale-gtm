# Value Prop Module + Methodology Reorder

## 1. Reorder methodology on `/project/home`

Move **Value Prop** from step 6 to step 3 (right after Personas). New order:

1. ICP
2. Personas
3. **Value Prop** (moved up)
4. Conversations
5. Competitors
6. Ecosystem
7. Campaign Strategy
8. Execution

Update `src/pages/Home.tsx` stepper array and the `methodology_progress` derivation so Value Prop status reflects real data (has ≥1 saved value prop).

## 2. Value Prop data model

New tables (with GRANTs + RLS scoped via project → org membership):

- `value_propositions` — one per ICP/persona target
  - `project_id`, `icp_id` (nullable), `persona_id` (nullable), `segment_label`
  - `format` enum: `memory_dart` | `elevator_pitch`
  - `fields` jsonb (structured slots from the handbook)
  - `statement` text (assembled final copy)
  - `status` enum: `draft` | `active` | `archived`
  - `is_primary` bool
  - `ai_rationale` text, `ai_model` text

- `value_prop_problems` — captured customer problems feeding the prop
  - `project_id`, `icp_id`, `persona_id`, `problem` text
  - `has_owner` bool, `tried_and_failed` bool, `saves_or_makes_money` bool, `broader_impact` bool
  - `worth_solving_score` int (0–4, computed from the four checks)
  - `source` enum: `manual` | `ai` | `conversation`

## 3. Value Prop wizard page `/project/value-prop`

New route + sidebar link (between Personas and Campaigns).

**Layout:**
- **Left rail**: list of value props grouped by ICP/persona, with status badges. "+ New Value Prop" button.
- **Editor** (three-step flow per prop):

  **Step A — Target & Problems**
  - Pick ICP + persona (prepopulated from existing records)
  - Problems list with the 4-characteristic checklist (handbook p.5)
  - "Brainstorm problems with AI" → pulls ICP pains, persona pain_points, discovery insights, and returns candidate problems each pre-scored against the 4 characteristics

  **Step B — Choose format & draft**
  - Toggle: Memory Dart vs Elevator Pitch
  - Structured form matching handbook slots:
    - Memory Dart: `I'm`, `I help`, `reduce/increase`, `by`
    - Elevator Pitch: `Our [solution]`, `helps [segment]`, `who want to [JTBD]`, `by [reduction]`, `and [improvement]`, `unlike [competitor]`
  - "Draft with AI" fills slots using ICP firmographics, persona goals/pains, brand voice, and problems from Step A
  - Live-assembled preview statement

  **Step C — Refine & save**
  - Editable final statement
  - "Suggest 3 variations" (AI) — different tones/angles using brand voice
  - Mark primary, set status, save

## 4. AI edge function `value-prop-assist`

Single function with actions: `brainstorm_problems`, `draft_statement`, `variations`, `critique`.

- Pulls project context: brand_voices, icps, personas, discovery_insights, existing value_propositions
- Uses `ai_prompt_templates` (new template key `value_prop_v1`) so admins can edit prompts
- Lovable AI Gateway, `google/gemini-3-flash-preview`
- Returns structured JSON (slots + rationale) — schema kept minimal per gateway rules

## 5. UI touch points

- Add Value Prop tile to Home stepper in new position
- Add sidebar entry "Value Prop" between "ICP & Personas" and "Campaigns"
- Campaign wizard: when selecting target ICPs, surface linked primary value prop as suggested messaging (read-only reference; no logic change to campaigns beyond a display hint)

## Out of scope
- No changes to campaigns table/schema
- No import from handbook PDF beyond the two frameworks (Memory Dart, Elevator Pitch)
- No competitor auto-analysis (that stays under Competitors step)
