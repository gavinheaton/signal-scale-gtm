ALTER TABLE public.asset_images
  ADD COLUMN IF NOT EXISTS aspect text NOT NULL DEFAULT '16:9';

ALTER TABLE public.asset_images
  DROP CONSTRAINT IF EXISTS asset_images_aspect_check;

ALTER TABLE public.asset_images
  ADD CONSTRAINT asset_images_aspect_check CHECK (aspect IN ('16:9', '1:1'));