
-- Enums
CREATE TYPE public.discovery_campaign_status AS ENUM ('active', 'paused', 'archived');
CREATE TYPE public.discovery_org_source AS ENUM ('firecrawl', 'manual');
CREATE TYPE public.discovery_org_status AS ENUM ('researching', 'targeted', 'in_conversation', 'validated', 'disqualified');
CREATE TYPE public.discovery_role_status AS ENUM ('identified', 'enriched', 'skipped');
CREATE TYPE public.discovery_enrichment_source AS ENUM ('apollo', 'manual');
CREATE TYPE public.discovery_outreach_status AS ENUM ('not_started', 'connection_sent', 'connected', 'dm_sent', 'email_sent', 'responded', 'closed_no_response');
CREATE TYPE public.discovery_insight_kind AS ENUM ('observation', 'interpretation');
CREATE TYPE public.discovery_theme_status AS ENUM ('emerging', 'confirmed', 'discarded');

-- Reusable updated_at trigger helper (idempotent)
CREATE OR REPLACE FUNCTION public.discovery_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- =============== discovery_campaigns ===============
CREATE TABLE public.discovery_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  target_segment text,
  icp_ids uuid[] NOT NULL DEFAULT '{}',
  persona_ids uuid[] NOT NULL DEFAULT '{}',
  qualifying_signals text[] NOT NULL DEFAULT '{}',
  disqualifying_signals text[] NOT NULL DEFAULT '{}',
  tiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  outreach_sequence jsonb NOT NULL DEFAULT jsonb_build_object(
    'step_1', 'LinkedIn connection request, personalised note, no pitch',
    'step_2_trigger_hours', 48,
    'step_2', 'Follow-up DM referencing a relevant case study',
    'step_3_trigger_days', 7,
    'step_3', 'Single follow-up email, one attempt only',
    'close_after_days', 7
  ),
  status public.discovery_campaign_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.discovery_campaigns TO authenticated;
GRANT ALL ON public.discovery_campaigns TO service_role;
ALTER TABLE public.discovery_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access discovery_campaigns in their org" ON public.discovery_campaigns
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = discovery_campaigns.project_id AND public.user_has_org_access(auth.uid(), p.org_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = discovery_campaigns.project_id AND public.user_has_org_access(auth.uid(), p.org_id)));

CREATE TRIGGER discovery_campaigns_updated_at BEFORE UPDATE ON public.discovery_campaigns
FOR EACH ROW EXECUTE FUNCTION public.discovery_set_updated_at();

CREATE INDEX idx_discovery_campaigns_project ON public.discovery_campaigns(project_id);

-- =============== discovery_organizations ===============
CREATE TABLE public.discovery_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.discovery_campaigns(id) ON DELETE CASCADE,
  name text NOT NULL,
  domain text,
  segment text,
  tier text,
  signals_matched text[] NOT NULL DEFAULT '{}',
  fit_notes text,
  source public.discovery_org_source NOT NULL DEFAULT 'manual',
  source_url text,
  status public.discovery_org_status NOT NULL DEFAULT 'researching',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.discovery_organizations TO authenticated;
GRANT ALL ON public.discovery_organizations TO service_role;
ALTER TABLE public.discovery_organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access discovery_organizations in their org" ON public.discovery_organizations
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.discovery_campaigns c
  JOIN public.projects p ON p.id = c.project_id
  WHERE c.id = discovery_organizations.campaign_id
    AND public.user_has_org_access(auth.uid(), p.org_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.discovery_campaigns c
  JOIN public.projects p ON p.id = c.project_id
  WHERE c.id = discovery_organizations.campaign_id
    AND public.user_has_org_access(auth.uid(), p.org_id)
));

CREATE TRIGGER discovery_organizations_updated_at BEFORE UPDATE ON public.discovery_organizations
FOR EACH ROW EXECUTE FUNCTION public.discovery_set_updated_at();

CREATE INDEX idx_discovery_orgs_campaign ON public.discovery_organizations(campaign_id);

-- =============== discovery_org_roles ===============
CREATE TABLE public.discovery_org_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.discovery_organizations(id) ON DELETE CASCADE,
  persona_id uuid REFERENCES public.personas(id) ON DELETE SET NULL,
  role_title text NOT NULL,
  source_url text,
  source_snippet text,
  status public.discovery_role_status NOT NULL DEFAULT 'identified',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.discovery_org_roles TO authenticated;
GRANT ALL ON public.discovery_org_roles TO service_role;
ALTER TABLE public.discovery_org_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access discovery_org_roles in their org" ON public.discovery_org_roles
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.discovery_organizations o
  JOIN public.discovery_campaigns c ON c.id = o.campaign_id
  JOIN public.projects p ON p.id = c.project_id
  WHERE o.id = discovery_org_roles.organization_id
    AND public.user_has_org_access(auth.uid(), p.org_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.discovery_organizations o
  JOIN public.discovery_campaigns c ON c.id = o.campaign_id
  JOIN public.projects p ON p.id = c.project_id
  WHERE o.id = discovery_org_roles.organization_id
    AND public.user_has_org_access(auth.uid(), p.org_id)
));

CREATE TRIGGER discovery_org_roles_updated_at BEFORE UPDATE ON public.discovery_org_roles
FOR EACH ROW EXECUTE FUNCTION public.discovery_set_updated_at();

CREATE INDEX idx_discovery_org_roles_org ON public.discovery_org_roles(organization_id);

-- =============== discovery_contacts ===============
CREATE TABLE public.discovery_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.discovery_organizations(id) ON DELETE CASCADE,
  org_role_id uuid REFERENCES public.discovery_org_roles(id) ON DELETE SET NULL,
  persona_id uuid REFERENCES public.personas(id) ON DELETE SET NULL,
  name text NOT NULL,
  title text,
  email text,
  linkedin_url text,
  enrichment_source public.discovery_enrichment_source NOT NULL DEFAULT 'manual',
  apollo_person_id text,
  outreach_status public.discovery_outreach_status NOT NULL DEFAULT 'not_started',
  connection_sent_at date,
  connection_accepted_at date,
  dm_sent_at date,
  email_sent_at date,
  reminder_date date,
  reminder_note text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.discovery_contacts TO authenticated;
GRANT ALL ON public.discovery_contacts TO service_role;
ALTER TABLE public.discovery_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access discovery_contacts in their org" ON public.discovery_contacts
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.discovery_organizations o
  JOIN public.discovery_campaigns c ON c.id = o.campaign_id
  JOIN public.projects p ON p.id = c.project_id
  WHERE o.id = discovery_contacts.organization_id
    AND public.user_has_org_access(auth.uid(), p.org_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.discovery_organizations o
  JOIN public.discovery_campaigns c ON c.id = o.campaign_id
  JOIN public.projects p ON p.id = c.project_id
  WHERE o.id = discovery_contacts.organization_id
    AND public.user_has_org_access(auth.uid(), p.org_id)
));

CREATE TRIGGER discovery_contacts_updated_at BEFORE UPDATE ON public.discovery_contacts
FOR EACH ROW EXECUTE FUNCTION public.discovery_set_updated_at();

CREATE INDEX idx_discovery_contacts_org ON public.discovery_contacts(organization_id);
CREATE INDEX idx_discovery_contacts_reminder ON public.discovery_contacts(reminder_date) WHERE reminder_date IS NOT NULL;

-- =============== discovery_conversations ===============
CREATE TABLE public.discovery_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.discovery_contacts(id) ON DELETE CASCADE,
  date date,
  duration_minutes integer,
  objective text,
  key_topics text[] NOT NULL DEFAULT '{}',
  guiding_questions text[] NOT NULL DEFAULT '{}',
  customer_profile_snapshot text,
  raw_notes text,
  next_steps text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.discovery_conversations TO authenticated;
GRANT ALL ON public.discovery_conversations TO service_role;
ALTER TABLE public.discovery_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access discovery_conversations in their org" ON public.discovery_conversations
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.discovery_contacts ct
  JOIN public.discovery_organizations o ON o.id = ct.organization_id
  JOIN public.discovery_campaigns c ON c.id = o.campaign_id
  JOIN public.projects p ON p.id = c.project_id
  WHERE ct.id = discovery_conversations.contact_id
    AND public.user_has_org_access(auth.uid(), p.org_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.discovery_contacts ct
  JOIN public.discovery_organizations o ON o.id = ct.organization_id
  JOIN public.discovery_campaigns c ON c.id = o.campaign_id
  JOIN public.projects p ON p.id = c.project_id
  WHERE ct.id = discovery_conversations.contact_id
    AND public.user_has_org_access(auth.uid(), p.org_id)
));

CREATE TRIGGER discovery_conversations_updated_at BEFORE UPDATE ON public.discovery_conversations
FOR EACH ROW EXECUTE FUNCTION public.discovery_set_updated_at();

CREATE INDEX idx_discovery_conversations_contact ON public.discovery_conversations(contact_id);

-- =============== discovery_themes ===============
CREATE TABLE public.discovery_themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.discovery_campaigns(id) ON DELETE CASCADE,
  label text NOT NULL,
  description text,
  status public.discovery_theme_status NOT NULL DEFAULT 'emerging',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.discovery_themes TO authenticated;
GRANT ALL ON public.discovery_themes TO service_role;
ALTER TABLE public.discovery_themes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access discovery_themes in their org" ON public.discovery_themes
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.discovery_campaigns c
  JOIN public.projects p ON p.id = c.project_id
  WHERE c.id = discovery_themes.campaign_id
    AND public.user_has_org_access(auth.uid(), p.org_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.discovery_campaigns c
  JOIN public.projects p ON p.id = c.project_id
  WHERE c.id = discovery_themes.campaign_id
    AND public.user_has_org_access(auth.uid(), p.org_id)
));

CREATE TRIGGER discovery_themes_updated_at BEFORE UPDATE ON public.discovery_themes
FOR EACH ROW EXECUTE FUNCTION public.discovery_set_updated_at();

CREATE INDEX idx_discovery_themes_campaign ON public.discovery_themes(campaign_id);

-- =============== discovery_insights ===============
CREATE TABLE public.discovery_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.discovery_conversations(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.discovery_campaigns(id) ON DELETE CASCADE,
  text text NOT NULL,
  kind public.discovery_insight_kind NOT NULL DEFAULT 'observation',
  is_quote boolean NOT NULL DEFAULT false,
  theme_id uuid REFERENCES public.discovery_themes(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.discovery_insights TO authenticated;
GRANT ALL ON public.discovery_insights TO service_role;
ALTER TABLE public.discovery_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access discovery_insights in their org" ON public.discovery_insights
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.discovery_campaigns c
  JOIN public.projects p ON p.id = c.project_id
  WHERE c.id = discovery_insights.campaign_id
    AND public.user_has_org_access(auth.uid(), p.org_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.discovery_campaigns c
  JOIN public.projects p ON p.id = c.project_id
  WHERE c.id = discovery_insights.campaign_id
    AND public.user_has_org_access(auth.uid(), p.org_id)
));

CREATE INDEX idx_discovery_insights_campaign ON public.discovery_insights(campaign_id);
CREATE INDEX idx_discovery_insights_conversation ON public.discovery_insights(conversation_id);
CREATE INDEX idx_discovery_insights_theme ON public.discovery_insights(theme_id) WHERE theme_id IS NOT NULL;
