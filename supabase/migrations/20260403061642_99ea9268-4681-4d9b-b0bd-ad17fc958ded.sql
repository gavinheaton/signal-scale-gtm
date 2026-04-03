
-- Create wizard session type enum
CREATE TYPE public.wizard_session_type AS ENUM ('icp', 'persona', 'competitor');
CREATE TYPE public.wizard_session_status AS ENUM ('in_progress', 'complete');

-- Create wizard_sessions table
CREATE TABLE public.wizard_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  session_type wizard_session_type NOT NULL,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  draft_output jsonb NOT NULL DEFAULT '{}'::jsonb,
  status wizard_session_status NOT NULL DEFAULT 'in_progress',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.wizard_sessions ENABLE ROW LEVEL SECURITY;

-- RLS policies using same pattern as other tables
CREATE POLICY "Users can view project wizard sessions"
  ON public.wizard_sessions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = wizard_sessions.project_id
    AND user_has_org_access(auth.uid(), p.org_id)
  ));

CREATE POLICY "Users can insert project wizard sessions"
  ON public.wizard_sessions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = wizard_sessions.project_id
    AND user_has_org_access(auth.uid(), p.org_id)
  ));

CREATE POLICY "Users can update project wizard sessions"
  ON public.wizard_sessions FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = wizard_sessions.project_id
    AND user_has_org_access(auth.uid(), p.org_id)
  ));
