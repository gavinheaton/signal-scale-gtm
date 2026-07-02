## Plan

1. **Make the ICP wizard generate its opening through AI, not a static message**
   - Change the first turn so the edge function sends a synthetic instruction to Claude when prior ICPs exist.
   - The opening should acknowledge the company knowledge already available and ask only whether the new ICP is a variation of an existing ICP or a genuinely new segment.

2. **Inject a stronger “known company facts” context block**
   - Load and pass these into `icp-wizard` before any AI response:
     - Existing ICPs for the project.
     - Completed brand voice data where available.
     - `projects` fields such as name, website URL, and `brand_context`.
   - Mark this block as authoritative so the AI must not ask again for company basics like website, product, positioning, target market context, or buying culture if already present.

3. **Always append runtime diff-mode rules**
   - Do not rely only on the editable/admin prompt template, because the active database prompt may be older than the fallback prompt.
   - Append non-negotiable runtime rules after the active prompt so diff mode works even if the admin-managed ICP prompt has not been updated.

4. **Prefill inherited draft sections where possible**
   - When the user chooses “Variation of X”, instruct the AI to copy usable sections from that ICP into the draft and only ask about deltas.
   - Preserve `inherited_sections` metadata so the preview can track which sections came from a previous ICP.

5. **Tighten session handling**
   - When existing ICPs are present but the current in-progress session was created without company-context diff mode, prompt the user to start fresh.
   - Starting fresh should cancel stale in-progress ICP sessions and immediately create a context-aware diff-mode session.

6. **Validate the flow**
   - Confirm that creating another ICP starts with known company context instead of asking for the website/company basics again.
   - Confirm quick-reply chips still appear and the draft updates after selecting a variation.