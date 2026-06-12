// Shared helpers for per-project Notion integration.
// Each project stores its own Notion internal-integration token via
// `project_connections` (provider='notion') with the key in Supabase Vault.

export const NOTION_API = "https://api.notion.com/v1";
export const NOTION_VERSION = "2022-06-28";

export async function resolveNotionKey(
  serviceClient: any,
  projectId: string,
): Promise<string | null> {
  const { data: conn } = await serviceClient
    .from("project_connections")
    .select("api_key_secret_id")
    .eq("project_id", projectId)
    .eq("provider", "notion")
    .maybeSingle();

  if (!conn?.api_key_secret_id) return null;

  const { data: secretRow } = await serviceClient
    .schema("vault" as any)
    .from("decrypted_secrets")
    .select("decrypted_secret")
    .eq("id", conn.api_key_secret_id)
    .maybeSingle();

  return (secretRow?.decrypted_secret as string) || null;
}

export function notionHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Notion-Version": NOTION_VERSION,
  };
}

export const NOTION_NOT_CONFIGURED_ERROR =
  "Notion is not connected for this project. Open Settings → Connections and add your Notion API key.";
