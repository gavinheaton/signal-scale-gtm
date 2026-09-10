# Sharpen the competitive landscape charts

## What will change

- Make organisation dots fully opaque with cleaner borders and a stronger visual distinction for the client organisation.
- Replace the small default chart labels with purpose-built SVG labels using larger, medium-weight text and a subtle light backing so names remain legible over gridlines and nearby dots.
- Increase axis, quadrant, and legend text clarity while keeping the current chart structure and market-position logic unchanged.
- Apply the same treatment to both the main Market Position chart and the detailed dimension chart.
- Add a print-specific presentation with larger labels and markers so the board-pack PDF remains sharp and readable without relying on browser scaling.

## Technical details

- Keep the charts vector-based through Recharts/SVG; no raster screenshots will be introduced.
- Use explicit custom dot and label renderers rather than translucent default cells and `LabelList` styling.
- Use the existing screen/print prop to tune chart height, marker size, label size, margins, and animation separately for each output.
- Preserve tooltips, organisation selection, persona filtering, colours, scores, and existing chart data.

## Verification

- Check the live chart at desktop width for sharp labels, dots, axes, and quadrant headings.
- Check crowded names for overlap and clipping at chart edges.
- Generate the board-pack print view and visually inspect the market-position and dimension-detail pages before considering the change complete.
