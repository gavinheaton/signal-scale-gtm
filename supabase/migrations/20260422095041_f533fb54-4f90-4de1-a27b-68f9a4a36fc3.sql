-- 1. Extend campaign_assets with feature image, SEO, and WordPress columns
ALTER TABLE public.campaign_assets
  ADD COLUMN IF NOT EXISTS feature_image_url text,
  ADD COLUMN IF NOT EXISTS feature_image_alt text,
  ADD COLUMN IF NOT EXISTS seo_meta jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS wordpress_post_url text,
  ADD COLUMN IF NOT EXISTS wordpress_post_id text;

-- 2. Asset images table — stores AI-generated variants per asset
CREATE TABLE IF NOT EXISTS public.asset_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.campaign_assets(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  public_url text NOT NULL,
  prompt text,
  variant_index integer NOT NULL DEFAULT 0,
  is_selected boolean NOT NULL DEFAULT false,
  is_composited boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_images_asset_id ON public.asset_images(asset_id);

ALTER TABLE public.asset_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view asset images"
ON public.asset_images FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM campaign_assets ca
  JOIN campaigns c ON c.id = ca.campaign_id
  JOIN projects p ON p.id = c.project_id
  WHERE ca.id = asset_images.asset_id
    AND user_has_org_access(auth.uid(), p.org_id)
));

CREATE POLICY "Users can insert asset images"
ON public.asset_images FOR INSERT
TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM campaign_assets ca
  JOIN campaigns c ON c.id = ca.campaign_id
  JOIN projects p ON p.id = c.project_id
  WHERE ca.id = asset_images.asset_id
    AND user_has_org_access(auth.uid(), p.org_id)
));

CREATE POLICY "Users can update asset images"
ON public.asset_images FOR UPDATE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM campaign_assets ca
  JOIN campaigns c ON c.id = ca.campaign_id
  JOIN projects p ON p.id = c.project_id
  WHERE ca.id = asset_images.asset_id
    AND user_has_org_access(auth.uid(), p.org_id)
));

CREATE POLICY "Users can delete asset images"
ON public.asset_images FOR DELETE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM campaign_assets ca
  JOIN campaigns c ON c.id = ca.campaign_id
  JOIN projects p ON p.id = c.project_id
  WHERE ca.id = asset_images.asset_id
    AND user_has_org_access(auth.uid(), p.org_id)
));

-- 3. Project visual settings table
CREATE TABLE IF NOT EXISTS public.project_visual_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  visual_style_preset text DEFAULT 'editorial photography, technology-themed, human-centered, warm lighting, shallow depth of field, no text, no logos, cinematic',
  overlay_template jsonb DEFAULT '{
    "font_family": "Poppins",
    "font_size": 72,
    "font_weight": 700,
    "text_color": "#FFFFFF",
    "gradient_opacity": 0.55,
    "gradient_direction": "bottom",
    "padding": 80,
    "max_width_pct": 80,
    "alignment": "left"
  }'::jsonb,
  wordpress_site_id text,
  wordpress_default_category text,
  wordpress_default_status text DEFAULT 'draft',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.project_visual_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view project visual settings"
ON public.project_visual_settings FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM projects p
  WHERE p.id = project_visual_settings.project_id
    AND user_has_org_access(auth.uid(), p.org_id)
));

CREATE POLICY "Managers can insert project visual settings"
ON public.project_visual_settings FOR INSERT
TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM projects p
  WHERE p.id = project_visual_settings.project_id
    AND user_has_org_role(auth.uid(), p.org_id, ARRAY['owner','admin','manager','superadmin']::org_role[])
));

CREATE POLICY "Managers can update project visual settings"
ON public.project_visual_settings FOR UPDATE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM projects p
  WHERE p.id = project_visual_settings.project_id
    AND user_has_org_role(auth.uid(), p.org_id, ARRAY['owner','admin','manager','superadmin']::org_role[])
));

-- 4. Storage bucket for asset images (public so WordPress/previews can fetch directly)
INSERT INTO storage.buckets (id, name, public)
VALUES ('asset-images', 'asset-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies — public read, scoped writes
CREATE POLICY "Asset images are publicly viewable"
ON storage.objects FOR SELECT
USING (bucket_id = 'asset-images');

CREATE POLICY "Authenticated users can upload asset images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'asset-images');

CREATE POLICY "Authenticated users can update asset images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'asset-images');

CREATE POLICY "Authenticated users can delete asset images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'asset-images');

-- 5. Updated_at trigger for project_visual_settings
CREATE OR REPLACE FUNCTION public.update_visual_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_project_visual_settings_updated_at ON public.project_visual_settings;
CREATE TRIGGER trg_project_visual_settings_updated_at
BEFORE UPDATE ON public.project_visual_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_visual_settings_updated_at();