CREATE TABLE public.canvas_suggestions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  canvas_id uuid NOT NULL REFERENCES public.canvases(id) ON DELETE CASCADE,
  box text NOT NULL,
  content text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.canvas_suggestions TO authenticated;
GRANT ALL ON public.canvas_suggestions TO service_role;

ALTER TABLE public.canvas_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "canvas_suggestions via canvas" ON public.canvas_suggestions
FOR ALL TO authenticated
USING (canvas_id IN (
  SELECT c.id FROM public.canvases c
  JOIN public.projects p ON p.id = c.project_id
  JOIN public.org_memberships om ON om.org_id = p.org_id
  WHERE om.user_id = auth.uid()
))
WITH CHECK (canvas_id IN (
  SELECT c.id FROM public.canvases c
  JOIN public.projects p ON p.id = c.project_id
  JOIN public.org_memberships om ON om.org_id = p.org_id
  WHERE om.user_id = auth.uid()
));

CREATE INDEX canvas_suggestions_canvas_box_idx ON public.canvas_suggestions (canvas_id, box, status);

CREATE TRIGGER canvas_suggestions_set_updated_at BEFORE UPDATE ON public.canvas_suggestions
FOR EACH ROW EXECUTE FUNCTION public.discovery_set_updated_at();