

# Add "New Project" to /projects page

## What to build
Add a "+ New Project" button and dialog to the Projects page so users can create projects directly, instead of being told to go to Settings.

## Implementation

### Update `src/pages/Projects.tsx`
- Add a "+ New Project" button in the header area (visible when projects exist) and in the empty state
- Add a Dialog with a simple form: project name (required text input)
- On submit, insert into `projects` table with `org_id` from membership, default status `setup`, default `methodology_progress`
- Refresh the project list after creation
- Show toast on success/error

### No database changes needed
The `projects` table already has an INSERT RLS policy (`user_has_org_access`), so authenticated users with org membership can create projects. Default values for `status` and `methodology_progress` are already set in the schema.

### Components used
- Dialog, DialogContent, DialogHeader, DialogTitle from existing UI
- Form with Input for project name
- Button for trigger and submit
- toast for feedback

