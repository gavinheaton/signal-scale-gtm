

# Make Persona Wizard Read ICP Data on Init

## Problem
The persona wizard has the ICP context in its system prompt, but the initial message is hardcoded — it just lists missing roles generically. The AI never actually *reads* the ICP's firmographics, psychographics, buyer_roles, etc. to suggest specific archetypes informed by that data.

## Solution
When a session starts with an `icp_id` and no user message, instead of returning a hardcoded initial message, make an actual AI call with a synthetic user prompt like "Analyse the ICP data provided and suggest the specific buying influences I should map for this segment." This lets Claude read the full ICP context (firmographics, psychographics, buyer roles, anti-ICP signals) and propose tailored archetypes.

## Changes

### `supabase/functions/persona-wizard/index.ts`

- Remove the hardcoded `initialMessage` logic (the `if/else` block that builds a static string about missing roles)
- When `!message` (session init): insert a synthetic user message `"Analyse the ICP buyer roles data and suggest the key buying influences I should build for this segment."` into the messages array
- Make the Anthropic API call with this synthetic message so the AI can read the full ICP context from the system prompt and respond with specific, data-informed persona suggestions
- Return the AI's response as the opening message instead of the hardcoded text

This is a single-file change to the edge function. No frontend changes needed — the persona wizard page already passes `icp_id` and displays whatever the AI returns.

## Files
- **Modify**: `supabase/functions/persona-wizard/index.ts`

