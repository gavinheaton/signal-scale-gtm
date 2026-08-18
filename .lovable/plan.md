# Refresh the persona slide deck

Modernise the exported persona PowerPoint so it looks like a 2026 strategy deck rather than a boxed report. The visual language borrows from the Buying Influence Map already on the ICP & Personas page: role colour coding, thin type, generous negative space, a single circular focal element.

## The new look

**Role colour as the organising system.** Each persona's buying role (Champion, Economic Buyer, Influencer, End User, Blocker) gets its own accent colour, matched exactly to the influence map on screen. That colour drives the slide's accent bar, the role chip, and the section header rules — so a Champion deck reads visually different from a Blocker deck.

**Editorial header instead of a navy banner.** Replace the full-width navy block with a light canvas, a thin role-coloured rule, a large light-weight persona name, and a small uppercase tracked role/ICP line. Feels like a magazine spread rather than a dashboard.

**Influence dial replacing the dot row.** The AI Readiness dots become a small circular gauge in the top-right — a thin ring with a role-coloured arc — echoing the sunburst.

**Cards become quiet panels.** Drop the drop shadows and heavy borders. Use very light tinted fills with a single left hairline in the role colour, small uppercase tracked headers, and roomier line spacing. Numbered section markers (01, 02, 03…) in muted grey give the systematic feel of the map.

**Opening summary slide per persona.** Before the detail grid, one calm slide: persona name at large scale, role chip, the single most important goal and the most important pain point side by side, and the "How we help" line as a closing statement. Detail cards follow on the next slide.

**Cover slide for the bulk export.** Dark navy, thin type, and a small legend of the role colours present in the deck, so the palette reads as intentional from slide one.

## Technical notes

- All changes are confined to `src/lib/personaPptx.ts`. No database, edge function, or on-screen UI changes.
- Add a `ROLE_ACCENTS` map converting the influence map's HSL role colours to the hex values pptxgenjs needs (champion purple, economic buyer green, influencer blue, end user amber, blocker red).
- Keep the existing 3-column greedy packing and card-splitting logic — it is measured and works; only the drawing layer and spacing constants change.
- Keep the summary slide content strictly derived from existing persona fields; no invented copy.
- QA: render the deck to images via LibreOffice and inspect every slide for overflow, clipping, and collisions before delivery, then re-verify after fixes.

## Not included

The on-screen Buying Influence Map itself is unchanged — this plan only borrows its visual language for the deck. Say the word if you also want the sunburst embedded as a slide.
