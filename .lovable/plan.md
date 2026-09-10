# Reliably detect linked partners in competitor discovery

## Confirmed issue
ERI’s configured website contains a direct link labelled **Value Advisory Partners** pointing to `http://valueadvisory.co/`. The current own-site scan sends scraped page content to AI and trusts the AI to return every relevant organisation, so an explicit link can be omitted even when it was successfully read.

## Plan
1. **Extract explicit organisation links deterministically**
   - Parse external links from the ERI homepage and the discovered about/partner/services pages before asking AI for suggestions.
   - Keep the visible link label, destination, and source page as evidence.
   - Exclude social networks, infrastructure vendors, directories, and the project’s own domain.

2. **Classify and validate linked organisations**
   - Treat labels containing signals such as “partner”, “alliance”, or a company name as organisation candidates.
   - Follow redirects and normalise `http://valueadvisory.co/` to its resolved canonical domain without discarding it.
   - Verify that the destination represents the named organisation; save linked partners as adjacent organisations with `source: own_site` and a clear “Linked partner” reason.

3. **Use AI as enrichment, not as the sole detector**
   - Merge deterministic link candidates with AI-extracted organisations.
   - Deduplicate by normalised domain and company name.
   - Preserve explicit links even when the AI does not mention them.

4. **Recover the ERI result and verify the flow**
   - Re-run or directly recover Value Advisory for ERI after the fix, retaining the ERI source-page evidence.
   - Test that Value Advisory appears once, is labelled as found on ERI’s website, and can be researched normally.

## Technical details
- Update the shared Firecrawl helper to return page links alongside readable content, or add a dedicated link-extraction helper.
- Update `competitor-discover` so direct external-link extraction runs before the current own-site AI pass.
- Keep the existing background job, incremental saves, identity checks, and duplicate protections.
- No new database table is expected; existing `source`, `why_suggested`, `evidence`, and competitor type fields can hold this result.
