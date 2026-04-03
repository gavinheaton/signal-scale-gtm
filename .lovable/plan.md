

# Persona Detail Card — Visual Layout

## Problem
Clicking a persona currently expands inline with raw `JSON.stringify` dumps. It's unreadable and doesn't match the quality of the rest of the platform.

## What we'll build
A full-screen modal/dialog that opens when clicking a persona card, displaying the persona data in a visually structured card layout inspired by the reference image. The design will use the existing brand palette (navy sidebar, purple accent, orange sub-headings) and present persona data in a grid of themed section cards.

## Key design decisions

**Layout**: A `Dialog` (full-width, max-w-4xl) with a two-column grid of content sections, a prominent header area with persona name and role badge, and an AI readiness indicator.

**Sections displayed** (mapped from stored data):
- **Name & Role** — `persona_name` + `role_in_buying` badge (header area, not a card)
- **Goals** — from `goals` jsonb
- **Pain Points** — from `pain_points` jsonb  
- **Channel Preferences** — from `channel_preferences` jsonb (excluding nested `preferred_evidence`)
- **Preferred Evidence** — extracted from `channel_preferences.preferred_evidence`
- **How We Help** — from `how_we_help` text
- **AI Readiness** — visual score indicator from `ai_readiness_score`

Each section rendered as a light card with an orange sub-heading label, a muted descriptor line, and the actual content formatted as readable bullet points (not JSON).

**Data formatting**: A utility function will intelligently render jsonb fields — if it's an array, render as bullets; if it's an object with keys, render as labelled items; if it's a string, render as paragraph.

## Database consideration
The wizard draft captures `organisational_context` and `buying_behaviour` but these aren't persisted to the `personas` table. We should add these columns so the detail view can show them.

**Migration**: Add `organisational_context jsonb` and `buying_behaviour jsonb` columns to the `personas` table. Update the save logic in `PersonaWizard.tsx` to include these fields.

## Changes

### 1. Create `src/components/PersonaDetailModal.tsx`
- New component: visual persona detail modal
- Header: persona name (large), role badge (color-coded), ICP segment name, AI readiness score as 5 filled/unfilled dots
- Body: 2-column grid of section cards, each with orange heading, muted descriptor, and formatted content
- Section cards: Goals, Pain Points, Organisational Context, Buying Behaviour, Channel Preferences, Preferred Evidence, How We Help
- Smart JSON renderer that handles arrays, objects, and strings gracefully
- Edit and Delete action buttons in the header

### 2. Create migration to add columns
- Add `organisational_context jsonb` and `buying_behaviour jsonb` to `personas` table

### 3. Modify `src/pages/PersonaWizard.tsx`
- Include `organisational_context` and `buying_behaviour` in the `personaData` object passed to Supabase on save

### 4. Modify `src/types/database.ts`
- Add `organisational_context` and `buying_behaviour` to the `Persona` interface

### 5. Modify `src/pages/ICPPersonas.tsx`
- Replace the inline expand logic with opening `PersonaDetailModal`
- Pass selected persona + parent ICP to the modal
- Remove the `expandedPersona` state and inline detail rendering

## Files
- **Create**: `src/components/PersonaDetailModal.tsx`
- **Create**: Migration for new persona columns
- **Modify**: `src/pages/PersonaWizard.tsx` — save new fields
- **Modify**: `src/types/database.ts` — add fields to Persona type
- **Modify**: `src/pages/ICPPersonas.tsx` — use modal instead of inline expand

