# Brand Guide PowerPoint export

Turn a completed brand voice into a polished, presentable Brand Guide deck (.pptx) that a team or client can actually use — every principle, example, vocabulary choice and writing sample laid out as designed slides rather than a wall of bullets.

## Where it appears

A **Download Brand Guide** button next to the existing Export for Cowork action, on both the Brand Voice card and the Brand Voice detail page. Enabled once the brand voice is marked complete. Clicking it builds and downloads the file in the browser — no waiting on a server.

## What's in the deck

Slides are only created when there's real content for them, so no empty pages.

1. **Cover** — brand name, "Brand Voice & Messaging Guide", project name, date, styled with the brand's own primary/accent colours when the wizard captured them.
2. **Personality at a glance** — the personality adjectives as large chips, with the tone description as a single calm statement.
3. **How we sound** — tone description in full, plus locale/naming rules from brand identity.
4. **Writing principles** — one slide per principle: principle as the headline, the explanation, then a side-by-side "Instead of this / Write this" comparison using the bad and good examples. This is the heart of the guide.
5. **Words we use** — preferred vocabulary as a two-column "Use / Instead of" table.
6. **Words we avoid** — banned phrases laid out as struck-through chips with a short framing line.
7. **Formatting rules** — numbered rules in a clean two-column list.
8. **Channel guidance** — content-type guidance as cards, one per channel (blog, email, LinkedIn, etc.), split across slides as needed.
9. **Audiences** — each target audience with its tone adjustment, plus the segment name.
10. **Writing samples** — each sample presented as a quoted block with its type as a label, one or two per slide depending on length.
11. **Brand identity** — colour swatches, font, brand-name usage rules.
12. **Closing** — short "how to use this guide" slide referencing the guide's own principles, dark to bookend the cover.

## Design direction

Reuses the visual language already built for the persona deck so the two exports feel like one family: light canvas, thin large headings, small uppercase tracked labels, numbered section markers, quiet tinted panels with a single hairline accent — no drop shadows, no accent rules under titles. The accent colour comes from the brand's own captured colours where available, otherwise the platform purple.

No content is invented: every line comes from the stored brand voice fields. Sections the wizard didn't fill are simply skipped.

## Technical notes

- New file `src/lib/brandVoicePptx.ts` using `pptxgenjs` (already a dependency), mirroring the structure and helper approach of `src/lib/personaPptx.ts` — shared geometry constants, text-measurement-based card packing, and slide splitting when content overflows.
- Filename: `<project-slug>-brand-guide.pptx`.
- Buttons wired in `src/pages/BrandVoiceDetail.tsx` and `src/pages/BrandVoice.tsx`; the detail page already loads the full record, the card page fetches the full row on click (as Export for Cowork does).
- No database, edge function, or schema changes.
- QA: render the generated deck to images via LibreOffice and inspect every slide for overflow, clipping, collisions and low contrast, fix, then re-verify.
