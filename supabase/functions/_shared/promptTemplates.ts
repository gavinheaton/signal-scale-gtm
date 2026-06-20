import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/**
 * Look up the active prompt text for a given template key.
 * Falls back to a Supabase secret if no active version is configured.
 * Throws when neither source provides a prompt.
 */
export async function getActivePrompt(
  supabase: SupabaseClient,
  key: string,
  fallbackSecretName?: string,
): Promise<string> {
  try {
    const { data: template } = await supabase
      .from("ai_prompt_templates")
      .select("current_version_id")
      .eq("key", key)
      .maybeSingle();

    if (template?.current_version_id) {
      const { data: version } = await supabase
        .from("ai_prompt_template_versions")
        .select("prompt_text")
        .eq("id", template.current_version_id)
        .maybeSingle();
      if (version?.prompt_text) return version.prompt_text;
    }
  } catch (err) {
    console.error(`getActivePrompt(${key}) DB lookup failed:`, err);
  }

  if (fallbackSecretName) {
    const fallback = Deno.env.get(fallbackSecretName);
    if (fallback) return fallback;
  }

  throw new Error(
    `No active prompt found for key "${key}" and no fallback available`,
  );
}
