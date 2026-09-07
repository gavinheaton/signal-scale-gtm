
-- Ecosystem Map tables

CREATE TYPE public.ecosystem_node_kind AS ENUM (
  'project','segment','company','role','person',
  'partner','regulator','competitor','channel','influencer','community',
  'theme','insight','custom'
);

CREATE TYPE public.ecosystem_edge_kind AS ENUM (
  'serves','buys_from','partners_with','regulates',
  'competes_with','influences','belongs_to','evidences','custom'
);

CREATE TYPE public.ecosystem_layout_mode AS ENUM ('concentric','freeform');

-- Maps
CREATE TABLE public.ecosystem_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Ecosystem Map',
  layout_mode public.ecosystem_layout_mode NOT NULL DEFAULT 'concentric',
  viewport jsonb NOT NULL DEFAULT '{"zoom":1,"x":0,"y":0}'::jsonb,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ecosystem_maps TO authenticated;
GRANT ALL ON public.ecosystem_maps TO service_role;
ALTER TABLE public.ecosystem_maps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members access ecosystem_maps" ON public.ecosystem_maps
  FOR ALL TO authenticated
  USING (project_id IN (SELECT p.id FROM public.projects p JOIN public.org_memberships om ON om.org_id = p.org_id WHERE om.user_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT p.id FROM public.projects p JOIN public.org_memberships om ON om.org_id = p.org_id WHERE om.user_id = auth.uid()));

-- Nodes
CREATE TABLE public.ecosystem_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL REFERENCES public.ecosystem_maps(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  kind public.ecosystem_node_kind NOT NULL,
  ref_table text,
  ref_id uuid,
  label text NOT NULL,
  subtitle text,
  x double precision NOT NULL DEFAULT 0,
  y double precision NOT NULL DEFAULT 0,
  ring integer,
  cluster text,
  readiness_score integer,
  hidden boolean NOT NULL DEFAULT false,
  stale boolean NOT NULL DEFAULT false,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (map_id, ref_table, ref_id)
);
CREATE INDEX ecosystem_nodes_map_idx ON public.ecosystem_nodes(map_id);
CREATE INDEX ecosystem_nodes_project_idx ON public.ecosystem_nodes(project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ecosystem_nodes TO authenticated;
GRANT ALL ON public.ecosystem_nodes TO service_role;
ALTER TABLE public.ecosystem_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members access ecosystem_nodes" ON public.ecosystem_nodes
  FOR ALL TO authenticated
  USING (project_id IN (SELECT p.id FROM public.projects p JOIN public.org_memberships om ON om.org_id = p.org_id WHERE om.user_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT p.id FROM public.projects p JOIN public.org_memberships om ON om.org_id = p.org_id WHERE om.user_id = auth.uid()));

-- Edges
CREATE TABLE public.ecosystem_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL REFERENCES public.ecosystem_maps(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source_node_id uuid NOT NULL REFERENCES public.ecosystem_nodes(id) ON DELETE CASCADE,
  target_node_id uuid NOT NULL REFERENCES public.ecosystem_nodes(id) ON DELETE CASCADE,
  kind public.ecosystem_edge_kind NOT NULL DEFAULT 'custom',
  weight integer,
  note text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (map_id, source_node_id, target_node_id, kind)
);
CREATE INDEX ecosystem_edges_map_idx ON public.ecosystem_edges(map_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ecosystem_edges TO authenticated;
GRANT ALL ON public.ecosystem_edges TO service_role;
ALTER TABLE public.ecosystem_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members access ecosystem_edges" ON public.ecosystem_edges
  FOR ALL TO authenticated
  USING (project_id IN (SELECT p.id FROM public.projects p JOIN public.org_memberships om ON om.org_id = p.org_id WHERE om.user_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT p.id FROM public.projects p JOIN public.org_memberships om ON om.org_id = p.org_id WHERE om.user_id = auth.uid()));

-- updated_at triggers
CREATE TRIGGER ecosystem_maps_updated_at BEFORE UPDATE ON public.ecosystem_maps
  FOR EACH ROW EXECUTE FUNCTION public.discovery_set_updated_at();
CREATE TRIGGER ecosystem_nodes_updated_at BEFORE UPDATE ON public.ecosystem_nodes
  FOR EACH ROW EXECUTE FUNCTION public.discovery_set_updated_at();
CREATE TRIGGER ecosystem_edges_updated_at BEFORE UPDATE ON public.ecosystem_edges
  FOR EACH ROW EXECUTE FUNCTION public.discovery_set_updated_at();
