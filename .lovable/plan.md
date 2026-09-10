# Competitors: better manual entry, correct company matching, and your own site first

Three fixes, all on the Competitive Landscape page.

## 1. Add a competitor properly by hand

Today the box only takes a name and starts researching straight away, which is how a wrong company gets picked up. Replace it with an **Add competitor** dialog:

- Name (required)
- Website (optional, and if you give one it is used as-is — no guessing)
- Type: direct rival / adjacent / in-house / do nothing
- A one-line note on why they matter
- Buttons: **Save** or **Save and research**

Anything you add by hand goes straight into your landscape, and research never overwrites a website you typed in yourself.

## 2. Confirm it is the right company before saving a profile

The GHD problem: the name matches a haircare brand and an engineering firm, and the research took the first website it found.

New identity check, used by both "Find competitors" and any single research run:

- Search queries carry your market context (sector, service, country) rather than just "<name> official website".
- Every candidate website is read first, then scored against what the company is meant to be: does the content describe the expected sector and services, and does it operate in your markets? Each candidate gets a match verdict plus a one-line reason.
- Only a candidate that clears the bar is saved. If the best candidate is a clear mismatch it is rejected and the next one is tried, up to three candidates.
- If nothing clears the bar, the competitor is still kept, but with no website, a **Needs a website** flag on the card, and the reason shown ("closest match looked like a haircare brand, not engineering"). You then paste the right address and research again.
- The verdict and reason are stored with the profile, so you can see why a site was accepted.

Existing profiles get a **Wrong company?** action on the profile drawer that clears the website and re-runs the check, so GHD can be corrected without deleting it.

## 3. Read your own website first

Partners, integrations and named alternatives on your own site are the best source, and that is where valueadvisory.co was sitting.

- The project gets a **Your website** setting (asked for once on this page if it is missing).
- "Find competitors" now starts by reading your own site — home, about, partners/ecosystem and services pages — and pulls out every external organisation it links to or names.
- Those organisations are proposed first, marked **Found on your website**, with the page they came from as evidence. They are ranked above AI-proposed names because they are already verified as real.
- Then the AI proposes the rest of the set as it does today, skipping anything already found.

## Technical notes

- `competitors` gains `identity_verdict` (`match` | `unsure` | `mismatch`), `identity_reason`, `source` (`ai` | `manual` | `own_site`), and `domain_locked` boolean so manual/user-entered domains are never overwritten. `projects` gains `website` text.
- New shared helper in `supabase/functions/_shared/competitorAi.ts`: `resolveCompanySite(name, expectation, context)` — Firecrawl search with market-aware queries, scrape each candidate, one AI call per candidate returning `{verdict, reason, sector_seen}`, returns the first accepted candidate or a rejection with reason. `competitor-discover` and `competitor-enrich` both route through it instead of taking the first non-LinkedIn hit.
- `competitor-discover` gains an own-site pass ahead of the AI pass: scrape the project website plus link-map likely partner/ecosystem pages, extract external orgs via one AI call, filter out your own domain, socials, CDNs and generic vendors, then save with `source: 'own_site'` and `status: 'suggested'`.
- Frontend: replace the inline name input in `src/pages/CompetitiveLandscape.tsx` with an add dialog; show "Found on your website" and "Needs a website" badges; add the **Wrong company?** action and the identity reason in `CompetitorProfileDrawer.tsx`.
