
CREATE TABLE IF NOT EXISTS public.ai_prompt_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  sample_input_json jsonb,
  current_version_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_prompt_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.ai_prompt_templates(id) ON DELETE CASCADE,
  prompt_text text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_prompt_templates
  ADD CONSTRAINT ai_prompt_templates_current_version_fkey
  FOREIGN KEY (current_version_id) REFERENCES public.ai_prompt_template_versions(id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_prompt_templates TO authenticated;
GRANT ALL ON public.ai_prompt_templates TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_prompt_template_versions TO authenticated;
GRANT ALL ON public.ai_prompt_template_versions TO service_role;

ALTER TABLE public.ai_prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_prompt_template_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "superadmins manage prompt templates"
  ON public.ai_prompt_templates FOR ALL
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

CREATE POLICY "superadmins manage prompt template versions"
  ON public.ai_prompt_template_versions FOR ALL
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

CREATE TRIGGER ai_prompt_templates_updated_at
  BEFORE UPDATE ON public.ai_prompt_templates
  FOR EACH ROW EXECUTE FUNCTION public.discovery_set_updated_at();

INSERT INTO public.ai_prompt_templates (key, label, description) VALUES
  ('icp_wizard', 'ICP Wizard', 'System prompt for the ICP discovery wizard'),
  ('persona_wizard', 'Persona Wizard', 'System prompt for the persona-building wizard'),
  ('brand_voice_wizard', 'Brand Voice Wizard', 'System prompt for the brand voice wizard'),
  ('campaign_wizard', 'Campaign Wizard', 'System prompt for the campaign wizard'),
  ('market_intelligence_research', 'Market Intelligence — Research', 'Stage 1: grounded research synthesis'),
  ('market_intelligence_report', 'Market Intelligence — Report', 'Stage 2: client-facing HTML report')
ON CONFLICT (key) DO NOTHING;

-- Seed placeholder v1 for the two market-intelligence keys so the helper always succeeds.
DO $$
DECLARE
  research_template uuid;
  research_version uuid;
  report_template uuid;
  report_version uuid;
BEGIN
  SELECT id INTO research_template FROM public.ai_prompt_templates WHERE key = 'market_intelligence_research';
  IF research_template IS NOT NULL THEN
    INSERT INTO public.ai_prompt_template_versions (template_id, prompt_text)
    VALUES (research_template, 'You are a senior market intelligence researcher. Produce a grounded, source-cited research synthesis for the supplied brief. Return structured findings covering market context, key players, competitive dynamics, and signals worth tracking. Cite sources inline.')
    RETURNING id INTO research_version;
    UPDATE public.ai_prompt_templates SET current_version_id = research_version WHERE id = research_template;
  END IF;

  SELECT id INTO report_template FROM public.ai_prompt_templates WHERE key = 'market_intelligence_report';
  IF report_template IS NOT NULL THEN
    INSERT INTO public.ai_prompt_template_versions (template_id, prompt_text)
    VALUES (report_template, 'You are a market intelligence editor. Transform the supplied research synthesis into a client-facing HTML report. Use semantic HTML (h1/h2/h3, p, ul, table) with no inline styles. Lead with an executive summary, then sections for market landscape, competitors, opportunities, and recommended actions.')
    RETURNING id INTO report_version;
    UPDATE public.ai_prompt_templates SET current_version_id = report_version WHERE id = report_template;
  END IF;
END $$;
