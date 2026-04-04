CREATE OR REPLACE FUNCTION public.vault_create_secret(new_secret text, new_name text, new_description text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'vault', 'public' AS $$
DECLARE secret_id uuid;
BEGIN
  SELECT vault.create_secret(new_secret, new_name, new_description) INTO secret_id;
  RETURN secret_id;
END;$$;

CREATE OR REPLACE FUNCTION public.vault_delete_secret(secret_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'vault', 'public' AS $$
BEGIN
  DELETE FROM vault.secrets WHERE id = secret_id;
END;$$;