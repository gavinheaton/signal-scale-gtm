

# Replace Add Persona Form with Persona Wizard Navigation

## Problem
The "Add Persona" button on the Personas tab opens a manual form sheet. It should navigate to the AI-powered Persona Wizard instead, consistent with how "Add ICP Segment" now navigates to the ICP Wizard.

## Changes

### `src/pages/ICPPersonas.tsx`

1. **Remove manual persona form** — Delete the `Sheet`, `SheetContent`, `SheetTrigger`, and all form fields for manual persona creation. Remove associated state (`personaForm`, `personaOpen`) and the `handleAddPersona` function.

2. **Remove unused imports** — `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetTrigger`, `Input`, `Label`, `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue`, `Textarea`, `Plus`.

3. **Replace button** — The "Add Persona" button becomes a simple navigate button:
   ```tsx
   <Button size="sm" onClick={() => navigate('/project/persona-wizard')}>
     <Sparkles className="h-4 w-4 mr-1" /> Add Persona
   </Button>
   ```
   
   Note: This navigates without an `icp_id` param. The persona wizard should handle this gracefully (let the user pick an ICP in the chat).

