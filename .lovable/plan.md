## What’s going wrong

The wizard is still starting in `mode:first` for the project you’re testing, even though that project has a saved ICP. I found the likely cause: the edge function and frontend both count existing ICPs using `created_at`, but the live `icps` table does not have a `created_at` column.

That means the “read prior ICPs” query can fail or behave as if there are no prior ICPs, so the wizard falls back to the first-ICP flow and asks basic company questions again.

## Fix plan

1. **Make prior ICP lookup work against the real schema**
   - Remove `.order('created_at')` from ICP queries because `icps.created_at` does not exist.
   - Order by a stable existing field such as `segment_name` or just fetch without ordering.
   - Apply this in both:
     - `supabase/functions/icp-wizard/index.ts`
     - `src/pages/ICPWizard.tsx` chip builder.

2. **Make existing-ICP detection more robust**
   - In `icp-wizard`, explicitly handle ICP query errors instead of silently treating them as zero ICPs.
   - If the prior-ICP fetch fails, return a clear diagnostic error instead of starting the wrong wizard mode.

3. **Fix stale session resume logic**
   - On the frontend, avoid resuming an in-progress `mode:first` session when the project now has saved ICPs.
   - Automatically cancel that stale session and start a new diff-mode session, instead of showing a banner that still lets the old flow persist.

4. **Ensure the first assistant message uses company context**
   - For projects with prior ICPs, always invoke the AI-generated opening.
   - Include project fields, brand voice, brand context, and saved ICPs in the `<known_company_facts>` block.
   - Return quick-reply chips immediately: `Variation of X`, `Different segment`, `Ask me everything`.

5. **Validate the actual project state**
   - Confirm the project with ICP `Scaling Community Services Organisations — Australia` now creates a new ICP session with `mode:diff` and `context_version:company_context_v2`.
   - Confirm the opening no longer asks for website/company basics.

## Technical notes

No database migration is required for this fix. The bug is caused by code assuming timestamp columns exist on `icps` when they do not.