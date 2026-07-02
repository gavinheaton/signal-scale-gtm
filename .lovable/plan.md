## Changes

**1. `src/pages/ValueProp.tsx`** — remove framework references
- Header subtitle: drop "— DH18 framework" so it reads "Design pitches that resonate with each ICP".
- Problem-brainstorm helper text: replace "4 DH18 criteria" with "4 criteria".

**2. `supabase/functions/value-prop-assist/index.ts`** — decouple from Disruptors branding, use project name
- System prompt base: remove "trained on the Disruptors Co DH18 Value Prop Design handbook"; keep the strategist framing without the brand/handbook name.
- Other prompt sections: replace "handbook criteria" with "criteria" (behavior unchanged).
- Context injection: pass the current project's name into the AI payload as `project_name` and instruct the model that when drafting the `i_am` slot (or any brand self-reference), it must use the project name — not "Disruptors Co", not the operator's agency. Fetch `projects.name` alongside the existing `brand_voices` lookup.
- Draft prompt: explicitly state "`i_am` must start with the project name". Leave brand_voice tone/positioning available as flavor but never as the identity of the speaker.

## Out of scope
No schema changes. No UI restructuring. Existing saved value props are untouched.
