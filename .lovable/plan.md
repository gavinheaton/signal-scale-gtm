Add a visual glow/pulse indicator on the organisation row in OrganizationsTab while enrichment is actively running.

**How it works today**
- `enrichOne()` sets `enrichingId` to the org's id before calling the edge function, then clears it on completion/error.
- The only visual feedback is a spinning Loader2 icon inside the actions dropdown menu.

**What to change**
1. Add a `glow-pulse` keyframe animation to `tailwind.config.ts` that animates a colored box-shadow (using the primary / purple accent color) with a gentle opacity/breathe cycle.
2. In `OrganizationsTab.tsx`, on the collapsed `TableRow`, append the glow animation class whenever `enrichingId === o.id`. Also add a small inline badge/label (e.g. "Enriching…") next to the org name so the state is readable even when the row is collapsed.

**What NOT to change**
- No backend changes.
- No changes to the enrichment logic or status auto-advance.
- Keep the existing Loader2 in the dropdown menu.

**Testing**
- Trigger enrichment on an org row and verify the row has the animated glow and a visible "Enriching…" indicator.
- Verify the glow disappears when enrichment completes or errors.