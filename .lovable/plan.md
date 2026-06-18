## Discovery Module — Unknown → Known pipeline

A self-contained new module under `/project/discovery` that operationalises the Disruptors "Customer Conversations" methodology. It consumes the project's existing **ICPs** and **personas** (no changes to those pages), uses **Firecrawl** to discover matching organisations and the role-holders inside them, uses **Apollo** to enrich those roles into named contacts with email/LinkedIn, then runs the same sequenced outreach + Conversation Canvas + insight synthesis as discussed. No existing Signal2Scale page is modified except a one-line update to the Home methodology stepper.

### The pipeline

```text
ICP + Personas (existing)
        │
        ▼
[1] Discovery Campaign (scopes ICP + persona targets)
        │
        ▼
[2] Organisations (Firecrawl: search + scrape About/Team) ── auto-suggests role-holders per persona
        │
        ▼
[3] Contacts (Apollo enrichment of role-holders → named individuals)
        │
        ▼
[4] Sequenced outreach (manual send, in-app tracking) → Next Actions queue
        │
        ▼
[5] Conversation Canvas (per contact) → Observations + Quotes
        │
        ▼
[6] Insights Synthesis (themes unlocked at 20+ conversations)
```

### Navigation & routes

- Sidebar item **"Discovery"** (`MessagesSquare` icon) between ICP & Personas and Brand Voice.
- Routes: `/project/discovery` (campaign list), `/project/discovery/new`, `/project/discovery/:id/edit`, `/project/discovery/:id` (dashboard with 5 tabs: Organisations · Contacts · Next Actions · Conversations · Insights Synthesis).
- One-line change: Home's methodology stepper "Conversations" step links to `/project/discovery`.

### Data model (all tables prefixed `discovery_`, RLS via project → org_memberships)

```text
discovery_campaigns
  id, project_id, name, description, target_segment,
  icp_ids uuid[]              -- references existing icps.id (the source of "known good fit")
  persona_ids uuid[]          -- references existing personas.id (the roles to find)
  qualifying_signals text[], disqualifying_signals text[],
  tiers jsonb                 -- [{label, criteria}]
  outreach_sequence jsonb     -- {step_1, step_2_trigger_hours:48, step_2,
                              --  step_3_trigger_days:7, step_3, close_after_days:7}
  status (active|paused|archived), created_at, updated_at

discovery_organizations
  id, campaign_id, name, domain, segment, tier text,
  signals_matched text[], fit_notes text,
  source enum(firecrawl|manual), source_url text,
  status (researching|targeted|in_conversation|validated|disqualified)
  created_at

discovery_org_roles                  -- "we need a Champion at this org" (role-holders found before names)
  id, organization_id, persona_id,   -- persona_id ties back to existing personas table
  role_title text,                   -- the actual title scraped from team page (e.g. "Head of Risk")
  source_url text, source_snippet text,
  status (identified|enriched|skipped),
  created_at

discovery_contacts                   -- named individuals, created from enrichment or manual entry
  id, organization_id, org_role_id nullable, persona_id,
  name, title, email, linkedin_url,
  enrichment_source enum(apollo|manual), apollo_person_id text,
  outreach_status (not_started|connection_sent|connected|dm_sent|email_sent|responded|closed_no_response)
  connection_sent_at, connection_accepted_at, dm_sent_at, email_sent_at date
  reminder_date date, reminder_note text, notes text, created_at

discovery_conversations
  id, contact_id, date, duration_minutes int, objective text,
  key_topics text[], guiding_questions text[],
  customer_profile_snapshot text, raw_notes text, next_steps text, created_at

discovery_insights
  id, conversation_id, campaign_id, text,
  kind (observation|interpretation), is_quote bool, theme_id uuid null, created_at

discovery_themes
  id, campaign_id, label, description,
  status (emerging|confirmed|discarded), created_at
```

Each `CREATE TABLE` is followed in the same migration by `GRANT SELECT, INSERT, UPDATE, DELETE ON ... TO authenticated`, `GRANT ALL ... TO service_role`, `ENABLE ROW LEVEL SECURITY`, and policies mirroring the existing `campaigns` table (user has access where `project_id` belongs to an org they're a member of).

### Pages

**Discovery list** — cards per campaign showing target ICP names + persona chips, status, counts (orgs, contacts, conversations). "+ New Campaign".

**Campaign setup form** — name, description, target_segment, **multi-select ICPs** (from `icps` table for current project), **multi-select personas** (from `personas` table), qualifying/disqualifying signal tag inputs (defaults seeded from selected ICPs' `anti_icp_signals` and firmographics), tier repeater, and the outreach sequence with editable timings (defaults: DM trigger 48h, email trigger 7d, close-after 7d).

**Dashboard tab 1 — Organisations**
- Table: name · domain · tier · status · signals matched · # roles identified · # contacts.
- Two add paths:
  1. **"Find organisations" (AI)** — opens a panel that calls the `discovery-find-orgs` edge function. Inputs are taken from the campaign's ICPs + signals + tier criteria + target_segment. Firecrawl `search` finds candidates; for each, Firecrawl `scrape` pulls the homepage/about and the AI scores fit against qualifying/disqualifying signals and assigns a suggested tier. Returns a review list (name, domain, suggested tier, matched signals, one-line rationale, source URL); user ticks the ones to keep and clicks "Add to campaign" → bulk insert with `source='firecrawl'`. AI never auto-saves.
  2. **"+ Add manually"** — drawer with name, domain, tier select, signals checkboxes, fit notes.
- Row action **"Find roles"** on any org → calls `discovery-find-roles` edge function. Firecrawl maps + scrapes the org's About/Team/Leadership pages, AI matches discovered titles to the campaign's selected personas, returns proposed `discovery_org_roles` rows (persona, scraped title, source snippet, source URL) for user review and bulk save.

**Dashboard tab 2 — Contacts**
- Table grouped by organisation: name · title · persona · email · linkedin · outreach_status.
- Two add paths:
  1. **"Enrich with Apollo"** — appears on any `discovery_org_roles` row where `status='identified'`. Calls `discovery-enrich-apollo` edge function with `{org domain, role title, persona keywords}` → Apollo People Search → returns up to N candidate people with name, title, email (when available), LinkedIn URL, seniority. User selects which to add; selected rows insert into `discovery_contacts` with `enrichment_source='apollo'` and flip the parent role's status to `enriched`. (Apollo never auto-saves either.)
  2. **"+ Add manually"** — name, title, persona select, email, linkedin, notes.

**Dashboard tab 3 — Next Actions** — operational queue computed client-side from `discovery_contacts`:
- `connection_sent_at` set + `connection_accepted_at` set + no `dm_sent_at` → "Send follow-up DM" (the 48h DM step).
- `dm_sent_at` older than campaign's `step_3_trigger_days` (default 7) + no response → "Send follow-up email".
- `email_sent_at` older than `close_after_days` (default 7) + no response → "Close — no response" (single-attempt; UI never offers a second auto-email).
- Any contact with `reminder_date <= today` → row showing the `reminder_note`.
Each row has inline one-click actions (Mark sent / Mark accepted / Mark responded / Close) and a "Set reminder" popover (date + short note).

**Dashboard tab 4 — Conversations** — list of logged conversations + "+ New Conversation". Selecting a contact opens the **Conversation Canvas** (Objective, Key Topics tag input, Guiding Questions, Customer Profile pre-filled from contact + linked persona, Raw Notes textarea, Next Steps). Two AI buttons:
- **Suggest questions** → `discovery-suggest-questions` (uses objective + key_topics + linked persona's goals/pain_points → 5–8 open-ended "tell me about the last time you…" questions, written into the field, fully editable).
- **Summarise** → `discovery-summarise-notes` (raw_notes → list of `discovery_insights` rows, all `kind='observation'`, `is_quote=true` for verbatims, plus a draft `next_steps`). Output shown for review before persist. Interpretation insights only added manually.

**Dashboard tab 5 — Insights Synthesis** — filter chips Observation / Interpretation / Quotes. Insights grouped by theme (or "Unclustered").
- If conversation count `< 20`: progress bar "X of 20 conversations logged", no synthesis button.
- If `>= 20`: **Run synthesis** button → `discovery-run-synthesis` clusters all observation insights into proposed themes ranked by supporting-insight count, with a flag on directly conflicting insights across themes. Themes appear as editable cards with **Confirm / Merge / Discard**; confirming writes to `discovery_themes` and sets `theme_id` on contributing insights.

### Edge functions (new)

All use existing patterns (CORS, JWT validation, Zod input validation, `LOVABLE_API_KEY` via AI Gateway, `google/gemini-3-flash-preview` default).

| Function | Inputs | Outputs (returned for user review; never auto-saves) |
| --- | --- | --- |
| `discovery-find-orgs` | campaign_id | Firecrawl-discovered org candidates with `{name, domain, suggested_tier, matched_signals[], rationale, source_url}` |
| `discovery-find-roles` | organization_id | Proposed `discovery_org_roles` `{persona_id, role_title, source_snippet, source_url}` |
| `discovery-enrich-apollo` | org_role_id | Apollo People Search candidates `{name, title, email, linkedin_url, seniority, apollo_person_id}` |
| `discovery-suggest-questions` | conversation_id (or objective + key_topics + persona_id) | `{questions: string[5..8]}` |
| `discovery-summarise-notes` | conversation_id | `{insights: [{text, is_quote}], next_steps}` (observations only) |
| `discovery-run-synthesis` | campaign_id | `{themes: [{label, description, supporting_insight_ids[], conflicts_with_theme_label?}]}` |

### External services

- **Firecrawl** — already connected to this project (`FIRECRAWL_API_KEY` secret exists). Used inside `discovery-find-orgs` (`/v2/search` + `/v2/scrape`) and `discovery-find-roles` (`/v2/map` + `/v2/scrape` over About/Team paths).
- **Apollo** — new integration. I'll request `APOLLO_API_KEY` via `add_secret` at the start of the build (separate message). `discovery-enrich-apollo` calls Apollo's People Search REST API server-side only; the key is never sent to the browser.

### Explicitly out of scope (per spec)

- No live LinkedIn/email sending — the actual outbound action stays manual; we only log status, dates, and reminders.
- No notifications (email/SMS/push) for reminders or due actions — in-app queue only.
- No roles/permissions changes, no deal value or pipeline-stage fields, no forecasting.
- No edits to existing ICPs, Personas, Campaigns, Brand Voice, Content Pipeline, Analytics, or Settings pages (except the one-line Home stepper href).

### Build order

1. Migration: 7 `discovery_*` tables + GRANTs + RLS + `updated_at` triggers.
2. Request `APOLLO_API_KEY` via `add_secret`.
3. Sidebar item, routes, campaign list, setup form (ICP + persona multi-selects pulling from existing tables).
4. Dashboard shell + Organisations tab + `discovery-find-orgs` (Firecrawl).
5. Roles flow + `discovery-find-roles` (Firecrawl).
6. Contacts tab + `discovery-enrich-apollo` (Apollo).
7. Next Actions tab with computed rules and one-click handlers.
8. Conversation Canvas + `discovery-suggest-questions` + `discovery-summarise-notes`.
9. Insights Synthesis tab + `discovery-run-synthesis` (gated at 20 conversations).
10. Home stepper href update.
