## Goal
Add a **Download** action to persona viewing on `/project/icp-personas` that produces a formatted Word (.docx) file of the persona.

## What gets built

**1. Client-side DOCX generator** (`src/lib/personaDocx.ts`)
- Uses the `docx` npm package + `file-saver` style blob download (no backend, no edge function).
- Takes a `Persona` + its parent `ICP` and emits a styled document:
  - Title: persona name; subtitle line with role-in-buying and parent ICP segment
  - AI Readiness score rendered as `4 / 5`
  - One heading + body block per section, matching the modal's order:
    Goals · Pain Points · Organisational Context · Buying Behaviour · Channel Preferences · Preferred Evidence · How We Help
  - A shared renderer converts the jsonb shapes the modal already handles (string, array, nested object) into paragraphs, bullet lists, and sub-headings. Empty sections print "Not captured yet" in muted italics.
  - Brand styling: navy `#0f284c` headings, orange `#e33e23` sub-headings, purple `#8833ff` accents, Poppins-with-Arial fallback, US Letter page size, footer with "Signal + Scale".
- Filename: `<Persona Name> - Persona.docx` (slugified).

**2. UI wiring**
- `PersonaDetailModal.tsx`: add a **Download** button next to Edit in the header (and a "Download Word" item in the ⋯ menu for consistency).
- `ICPPersonas.tsx`: add "Download Word" to the per-card ⋯ overflow menu so it works without opening the modal.
- Both show a toast on success/failure.

**3. Bulk option**
- On the Personas tab header, a "Download all personas" button that emits a single .docx containing every persona in the project, one per page, grouped under their ICP segment, with a table of contents.

## Not in this change
The PPTX deck. Once the Word export is settled I'd build that as a separate step using `pptxgenjs` with a branded 1-slide-per-persona layout (photo/avatar block, role badge, goals vs pains two-column, readiness meter) — worth doing after we see how the Word output reads.

## Technical notes
- New dependency: `docx` (~pure JS, works in the browser via Vite).
- No schema changes, no edge functions, no RLS impact — the data is already loaded in the page.
- The section-rendering logic in `PersonaDetailModal` (`renderContent`) is mirrored, not shared, since one outputs React and one outputs docx elements; both read the same field list so they stay in sync visually.
