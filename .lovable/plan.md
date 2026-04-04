

# Pre-load ICP & Persona Context into Brand Voice Wizard

## Problem
The brand voice wizard asks about target audiences from scratch, even when the project already has defined ICPs and personas. This creates redundant questions and a disjointed experience.

## Solution
Fetch ICPs and personas for the project in the edge function, inject them into the system prompt as known context, and adjust the prompt instructions so Claude treats audiences as pre-filled and focuses on tone nuance per segment instead.

## Changes

### 1. Edge Function (`supabase/functions/brand-voice-wizard/index.ts`)

**Fetch ICP + persona data** alongside the existing `brand_context` fetch (around line 222):
- Query `icps` table for `segment_name, firmographics, psychographics, matrix_category, fit_score`
- Query `personas` table for `persona_name, role_in_buying, goals, pain_points, channel_preferences`
- Both filtered by `project_id`

**Inject into system prompt** (around line 325):
- If ICPs exist, append a structured block listing each ICP segment with key firmographic/psychographic details
- If personas exist, append a block listing each persona with their role, goals, and pain points
- Include instruction: "These ICPs and personas are already defined for this project. Do NOT ask the user to describe their target audience from scratch. Instead, use these to pre-populate the target_audiences section and ask nuanced questions about how tone should shift for each segment/persona."

**Pre-seed the draft**: When ICPs/personas exist and it's a new session, auto-populate `target_audiences` in the initial draft with segments derived from the ICP/persona data, so the preview panel shows partial completion immediately.

### 2. System Prompt Adjustment

Update the `FALLBACK_SYSTEM_PROMPT` section about Target Audiences:
- Current: "Target Audiences — Key audience segments with tone adjustments per segment"
- Updated: Add conditional instruction that when ICP/persona data is provided, the AI should reference those segments by name and ask about tone nuance (e.g., "How should your tone shift when addressing a CTO champion vs an economic buyer?") rather than asking "Who is your audience?"

### 3. Initial Message

Update `INITIAL_MESSAGE` logic: when ICPs/personas exist, adjust the opening message to acknowledge them, e.g.: "I can see you've already defined your ICPs and personas — I'll use those to shape the audience sections. Let's start with your company name and how you want your brand to sound."

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/brand-voice-wizard/index.ts` | Fetch ICPs + personas, inject into system prompt, pre-seed target_audiences draft |

No frontend changes needed — the preview panel already renders `target_audiences` dynamically.

