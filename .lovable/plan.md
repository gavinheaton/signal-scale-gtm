

# Enrich Content Generation with Full Brand Voice Context

## Problem
The `generate-campaign-content` edge function fetches the brand voice but only injects 3 of 10+ fields into the system prompt. Key voice-shaping data like writing principles, preferred vocabulary, formatting rules, and content-type-specific guidance are ignored.

## Fix

**File: `supabase/functions/generate-campaign-content/index.ts`**

Expand the `## BRAND VOICE` section of the system prompt (lines 92-101) to include all relevant brand voice fields:

1. **`brand_identity`** — inject company name, values, positioning statement so the AI understands who it's writing for
2. **`writing_principles`** — add as numbered rules the AI must follow (e.g. "Lead with outcomes, not features")
3. **`preferred_vocabulary`** — list "Use X instead of Y" pairs so the AI picks the right terminology
4. **`formatting_rules`** — add structural preferences (e.g. "Short paragraphs, max 3 sentences")
5. **`content_type_guidance`** — if guidance exists for the current `asset.asset_type`, inject it as type-specific tone direction (this is the most impactful addition)
6. **`writing_samples`** — include 1-2 excerpts as style reference so the AI can pattern-match tone

The prompt section will grow from ~5 lines to ~20-30 lines when a full brand voice exists, but stays minimal if fields are empty. All fields are checked with optional chaining before inclusion.

No database changes, no UI changes — single edge function file update.

