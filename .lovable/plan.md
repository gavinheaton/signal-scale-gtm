# Plan: Document-driven Brand Voice extraction + gap-filling

Yes, this makes sense — and the wizard already does part of it (uploads route to `brand-voice-wizard` with `file_url`, text is extracted, and a generic "analyse + ask about gaps" prompt is sent). The problem is that the analysis pass is loose: the AI summarises freely instead of producing a deterministic section-by-section map against the Signal+Scale schema, and the follow-up Q&A doesn't reliably target the missing slots.

This plan tightens that flow end-to-end.

## What changes

### 1. Edge function: `supabase/functions/brand-voice-wizard/index.ts`
- Replace the freeform `DOCUMENT_ANALYSIS_PROMPT` with a structured **extraction contract** keyed to the 10 S+S sections (personality_adjectives, tone_description, writing_principles, banned_phrases, preferred_vocabulary, formatting_rules, content_type_guidance, writing_samples, target_audiences, brand_identity).
- Force a **two-pass** first turn when `file_url` is present:
  1. **Extraction pass** — return draft JSON populated from the document only. Any field with no evidence stays empty; never invent. Each populated field carries a short `source_snippet` in working notes (kept internal, stripped from chat).
  2. **Gap report** — assistant reply lists per section: `✅ Captured` (with 1-line summary), `⚠️ Partial` (what's there, what's missing), `❌ Missing`. Ends with the single highest-priority question to fill the first gap.
- After extraction, set `sections_complete` strictly: only sections with substantive content from the doc.
- Persist the raw extracted document text on the session (truncated) so follow-up turns can re-reference it without re-downloading.
- Subsequent turns: system prompt instructs the model to walk gaps in order (Missing → Partial), ask one focused question per turn, and update only the targeted section in the `<draft>` block.

### 2. Frontend: `src/pages/BrandVoiceWizard.tsx`
- When `fileUrl` is present on first load, show a clearer status: "Analysing document and mapping to Signal+Scale sections…" then render the assistant's structured gap report (already markdown-rendered).
- Preview panel (`BrandVoicePreviewPanel`) already reflects section status — no change needed; the tighter `sections_complete` from the extraction pass will make ✅/⚠️/❌ accurate immediately after upload.

### 3. Types — no change
`BrandVoiceDraft` already covers all 10 sections.

## Out of scope
- No DB migrations.
- No new upload UI — existing upload entry on `/project/brand-voice` is retained.
- No change to PDF/DOCX extractors (working today; we'll keep the 8k-char cap).

## Acceptance
- Upload a tone-of-voice doc → wizard responds with a section-by-section ✅/⚠️/❌ report and a single targeted question.
- Preview panel shows completed sections highlighted from the first turn.
- Each follow-up answer fills exactly one gap and advances to the next.
