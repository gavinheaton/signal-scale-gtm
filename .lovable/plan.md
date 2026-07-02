# Disruptors Canvas — plan

Add a new "Canvas" phase to the methodology, one canvas per project, with two layers:
1. **Canvas summary** — the classic 9-box (or Shared Value variant), fits on a page, pitch-ready.
2. **Expanded narrative doc** — AI-written prose business model that pulls live from ICPs, personas, discovery, value prop, campaigns, and metrics; regenerated on demand.

## Database (new migration)

```sql
create type canvas_variant as enum ('standard','shared_value');
create type canvas_entry_status as enum ('assumption','hypothesis','validated');

create table public.canvases (
  id uuid pk, project_id uuid fk→projects, variant canvas_variant,
  narrative_md text, narrative_generated_at timestamptz,
  critique jsonb,           -- {alignment_issues:[], weak_boxes:[], gaps:[]}
  updated_at, created_at
);

create table public.canvas_entries (
  id uuid pk, canvas_id uuid fk, box text,   -- 'problem'|'solution'|'usp'|'unfair_advantage'
                                             -- |'customer_segments'|'metrics'|'channels'
                                             -- |'cost_structure'|'revenue_streams'
                                             -- shared_value adds: 'vp_stakeholder'|'vp_community'|'vp_customer'|'social_impact'
  content text,
  status canvas_entry_status default 'assumption',
  source text,              -- 'user'|'auto'|'ai_suggestion'
  source_ref jsonb,         -- {table:'icps', id:'…'} for traceable auto-fills
  ai_confidence numeric,
  position int,
  created_at, updated_at
);

create table public.canvas_validations (
  id uuid pk, entry_id uuid fk→canvas_entries,
  conversation_id uuid null fk→discovery_conversations,
  note text, outcome text,  -- 'supports'|'contradicts'|'inconclusive'
  created_at
);
```

All three tables get standard project-scoped RLS + GRANTs to `authenticated`/`service_role` (following the existing `discovery_*` pattern).

## Auto-population map (deterministic first pass)

| Box | Source |
|---|---|
| Problem | `value_prop_problems.title/description` |
| Solution | `value_propositions.solution_summary`, campaigns.objective |
| USP | `value_propositions.usp` if present, else empty for AI |
| Customer Segments | `icps.segment_name` + firmographics one-liner per ICP |
| Unfair Advantage | `discovery_insights` tagged as advantage/differentiator |
| Channels | distinct `campaign_assets.asset_type` + `campaigns.channel_mix` |
| Metrics | latest `campaign_metrics` KPIs the project actually tracks |
| Cost Structure | empty (AI suggests) |
| Revenue Streams | empty (AI suggests) |
| Shared Value boxes | AI-only (no direct source table) |

Each auto entry stores `source_ref` so the UI shows a chip ("From ICP: Deep-Tech Founders") and clicking it deep-links back.

## Edge functions

- **`canvas-sync`** — runs the deterministic map above; upserts entries with `source='auto'`, marks any prior auto entries no longer supported as stale (same wipe/rebuild pattern as `ecosystem-sync`).
- **`canvas-suggest`** — for a given box, returns 2-3 AI proposals using project context (ICPs, personas, discovery insights, value prop). Model: `google/gemini-3-flash-preview`, structured `Output.object`. User accepts → row inserted with `source='ai_suggestion'`.
- **`canvas-critique`** — whole-canvas review: problem↔solution alignment, weak USP analogies, missing anti-ICP coverage, channel/segment fit, hypothesis→validation coverage. Stores result in `canvases.critique`.
- **`canvas-narrative`** — generates the expanded prose doc from canvas entries + linked platform data. Streams markdown, stored in `canvases.narrative_md` with timestamp.

All four functions follow existing patterns (`corsHeaders`, JWT-in-code, Lovable AI Gateway via shared provider helper).

## Frontend

- **New page** `src/pages/Canvas.tsx` at route `/project/canvas`, added as a new phase in the methodology stepper (between Value Prop and Campaign Strategy) — updates `projects.methodology_progress` like existing phases.
- **`CanvasBoard.tsx`** — 9-box grid (or 4×3 shared value grid via variant toggle). Each box:
  - editable entries with status pill (assumption/hypothesis/validated), source chip, drag-to-reorder
  - "Suggest with AI" button → shows 2-3 proposals inline, accept/dismiss
  - inline "Validate" opens `ValidationDialog` linking to discovery conversations
- **`CanvasHeader.tsx`** — variant switcher, "Sync from data", "Critique canvas" (shows results in a side panel with jump-to-box links), "Generate narrative".
- **`ExpandedDocView.tsx`** — right-side drawer / dedicated `/project/canvas/narrative` tab rendering `narrative_md` with `react-markdown`, regenerate button, timestamp.
- **`ProjectContext`** / stepper: add `canvas` to phase list and progress calculation (complete when all 9 boxes have ≥1 entry).

## Assumption / hypothesis tracker

- Status pill on every entry defaults to `assumption`.
- `ValidationDialog` lets the user link an entry to one or more `discovery_conversations` and record outcome (supports/contradicts/inconclusive) → row in `canvas_validations`; entry auto-promotes to `validated` when ≥1 "supports" outcome exists.
- Small progress meter in header: "6 / 9 boxes have validated entries".

## Not in scope

- Notion/PDF export (can add later once narrative shape stabilises).
- Multiple canvases per project or canvas versioning (single current canvas per project for v1).
- Auto-diffing canvas changes over time.

## Expert additions worth flagging

- **Traceability chips** — every auto/AI entry links back to its source row, so stakeholders can see "why is this here?".
- **Handbook-native tracker** — the assumption→hypothesis→validated ladder mirrors p.4 of the handbook and gives the AI critique real teeth (it can score "% of canvas validated" instead of just checking presence).
- **Alignment check as first-class output** — the handbook's "internal validation" step (problem↔solution match) becomes an automated critique rule rather than a manual read-through.
