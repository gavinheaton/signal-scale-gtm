

# Fix: Calendar Component Rendering Inside Campaign Cards

## Problem
The lucide `Calendar` icon is imported as `CalendarIcon` (line 8), and the Shadcn `Calendar` date picker component is imported as `Calendar` (line 18). However, on lines 266 and 340, the code uses `<Calendar className="h-3 w-3" />` intending to show a small icon — but this renders the full interactive date picker component instead.

## Fix
In `src/pages/Campaigns.tsx`, replace the two occurrences of `<Calendar>` used as decorative icons (lines 266 and 340) with `<CalendarIcon>`, which is the lucide icon alias already imported on line 8.

### Line 266 (asset publish date in kanban)
```tsx
// Before
<Calendar className="h-2.5 w-2.5" />
// After
<CalendarIcon className="h-2.5 w-2.5" />
```

### Line 340 (campaign launch date in kanban)
```tsx
// Before
<Calendar className="h-3 w-3" />
// After
<CalendarIcon className="h-3 w-3" />
```

### Files changed
1. `src/pages/Campaigns.tsx` — two lines changed

