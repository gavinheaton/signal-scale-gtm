

# Redesign ICP Wizard — Visual Preview + Clear Save Flow

## Problems to solve
1. Save button only appears when `is_complete` is true, which depends on Claude setting that flag — easy to miss
2. The right panel is a plain list of key-value pairs — not visually engaging
3. No clear "you're done" moment or transition back to the platform

## Design approach

### Right panel: Visual ICP card (not a data dump)

Replace the current list-of-fields approach with a rich, branded ICP profile card:

- **Header**: Large segment name with a matrix category badge (color-coded: green/blue/amber/red) and animated fit/access score rings (circular progress indicators)
- **6 section cards as a radial/hexagon progress tracker**: A visual hex diagram where each of the 6 ICP sections is a segment that fills with color as it progresses (empty → partial → complete). Clicking a segment scrolls/highlights relevant data below
- **Section detail panels**: Expandable accordion-style cards beneath the hex. Each shows the data as nicely formatted tags/pills (not raw JSON). For example, firmographics shows industry as a pill, company size as a range badge, geography as flag icons
- **Overall completion bar**: A horizontal progress bar at the top showing "3 of 6 sections complete" with a percentage
- **Save CTA**: Always visible at the bottom but disabled/greyed until complete. When complete, it pulses with a subtle animation and the text changes to "Your ICP is ready — Save to Platform". After saving, show a brief success state with confetti/checkmark before redirecting

### Chat panel improvements

- Keep the chat at 50% width (not 60%) to give the visual panel more room
- Add a small "phase indicator" above the chat showing which section Claude is currently working on (derived from the draft's incomplete sections)
- When Claude completes a section, show a brief inline celebration (green checkmark toast within the chat)

### Save flow

- Always show the save button (disabled when incomplete)
- Add a completion summary step: when `is_complete` flips to true, auto-scroll the right panel to the top and show a "Review & Save" overlay on the preview card with all 6 sections expanded
- After save, show a 2-second success animation then redirect to ICP & Personas

## Files to change

1. **`src/pages/ICPWizard.tsx`** — Major rewrite of the right panel:
   - Replace raw key-value rendering with formatted tag/pill components
   - Add circular score indicators for fit/access
   - Add a radial progress visualization for the 6 sections
   - Add completion progress bar
   - Make save button always visible (disabled until complete)
   - Change layout to 50/50 split
   - Add current-section indicator above chat
   - Add save success animation before redirect

2. **`src/index.css`** — Add keyframe animations for:
   - Score ring fill animation
   - Save button pulse when complete
   - Section completion celebration

No backend or database changes needed — this is purely a frontend visual overhaul.

## Technical details

- Circular score rings: SVG `<circle>` with `stroke-dasharray`/`stroke-dashoffset` animated via CSS transitions
- Section progress hex: 6 SVG segments arranged in a hexagonal pattern, each with fill opacity transitioning based on status
- Tags/pills for section data: Parse the JSON objects and render each value as a styled `<Badge>` rather than `key: value` text
- Completion bar: Tailwind `w-[X%]` with CSS transition on width
- Success animation: Brief scale-up + checkmark icon before `navigate()`

