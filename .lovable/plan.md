# Auto-generate qualifying signals from ICPs

## Problem
In `DiscoveryCampaignForm`, when ICPs are selected, only **disqualifying** signals are seeded (from `anti_icp_signals`). Qualifying signals stay empty, so `discovery-find-orgs` has nothing to bias the search/scoring toward — hence weak qualifying-signal output downstream.

## Solution
Add an AI-powered "Suggest qualifying signals" step that derives crisp, observable buying signals from the selected ICPs' firmographics, psychographics, and buyer roles, plus a deterministic fallback so the field is never empty.

## Changes

### 1. New edge function `supabase/functions/discovery-suggest-qualifying-signals/index.ts`
- Input: `{ icp_ids: string[], project_id: string }`
- Loads those ICPs from the DB (RLS via caller JWT).
- Calls Lovable AI Gateway (`google/gemini-3-flash-preview`) with a system prompt encoding best practice for B2B qualifying signals:
  - Observable from public sources (job posts, news, filings, tech stack, funding, regulatory status, hiring patterns, leadership changes, product launches, partnerships, certifications).
  - Specific and falsifiable (e.g. "APRA-regulated entity", "hiring Head of AI in last 90 days", "Series B+ in fintech", "ISO 27001 certified") — not vague ("innovative", "growing").
  - Tied to the ICP's firmographics (industry, size, geography), psychographics (priorities, triggers), and buyer roles' pain points.
  - 6–10 signals, deduped, short noun phrases.
- Returns `{ signals: string[], rationale: string }`.
- CORS + JWT validation following existing discovery functions.

### 2. `src/pages/DiscoveryCampaignForm.tsx`
- Replace the empty-qualifying branch of the seed `useEffect` with a deterministic fallback derived from each ICP's `firmographics` (industry, company_size, geography) and `psychographics` (top triggers/priorities) — so something appears immediately.
- Add a **"Suggest with AI"** button next to the Qualifying signals `TagInput` label. On click → invoke the new edge function with currently selected `icpIds`, merge returned signals into existing qualifying tags (dedup, preserve user edits), toast on success/failure.
- Also auto-trigger the AI suggestion once when ICPs are first selected during create (only if qualifying is still empty), behind a guard so it runs at most once per session.
- Show a small loading state on the button.

### 3. `src/components/discovery/OrganizationsTab.tsx`
- No structural change. The improved qualifying signals feed straight into `discovery-find-orgs`'s existing query construction and AI scoring prompt.

## Out of scope
- No schema changes (signals already stored on `discovery_campaigns.qualifying_signals`).
- No change to `discovery-find-orgs` logic — it already consumes qualifying signals.
- No edits to disqualifying-signal seeding.
