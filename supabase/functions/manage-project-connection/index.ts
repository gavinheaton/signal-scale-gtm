import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await callerClient.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    if (req.method === "POST") {
      const { project_id, provider, api_key } = await req.json();

      if (!project_id || !provider || !api_key) {
        throw new Error("Missing required fields: project_id, provider, api_key");
      }
      if (!["claude", "notion"].includes(provider)) {
        throw new Error("Invalid provider. Must be 'claude' or 'notion'");
      }

      // Verify caller has admin+ role for this project's org
      const { data: project } = await serviceClient
        .from("projects")
        .select("org_id")
        .eq("id", project_id)
        .single();
      if (!project) throw new Error("Project not found");

      const { data: membership } = await serviceClient
        .from("org_memberships")
        .select("role")
        .eq("user_id", user.id)
        .eq("org_id", project.org_id)
        .single();

      const isSuperAdmin = await serviceClient.rpc("is_superadmin", { _user_id: user.id });
      const isAdmin = membership && ["owner", "admin"].includes(membership.role);

      if (!isSuperAdmin.data && !isAdmin) {
        throw new Error("Insufficient permissions. Requires admin role or above.");
      }

      // Check if connection already exists
      const { data: existing } = await serviceClient
        .from("project_connections")
        .select("id, api_key_secret_id")
        .eq("project_id", project_id)
        .eq("provider", provider)
        .maybeSingle();

      // If existing, delete old vault secret
      if (existing) {
        await serviceClient.rpc("vault_delete_secret", {
          secret_id: existing.api_key_secret_id,
        }).catch(() => {
          // vault_delete_secret may not exist, fallback to direct SQL
        });

        // Try direct deletion via SQL
        await serviceClient.from("vault.secrets" as any).delete().eq("id", existing.api_key_secret_id).catch(() => {});
      }

      // Store new key in vault
      const secretName = `project_${project_id}_${provider}_api_key`;
      const { data: secretId, error: vaultError } = await serviceClient
        .rpc("vault_create_secret", {
          new_secret: api_key,
          new_name: secretName,
          new_description: `${provider} API key for project ${project_id}`,
        });

      if (vaultError) {
        console.error("Vault error:", vaultError);
        throw new Error("Failed to store secret in vault");
      }

      await upsertConnection(serviceClient, existing, project_id, provider, secretId);

      // When (re)connecting Notion, wipe any cached workspace/database IDs from the
      // previous workspace so the next Setup rebuilds in the new workspace.
      if (provider === "notion") {
        await serviceClient
          .from("projects")
          .update({
            notion_workspace_id: null,
            notion_calendar_db_id: null,
            notion_pillars_db_id: null,
            notion_foundations_db_id: null,
            notion_last_synced_at: null,
          })
          .eq("id", project_id);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "DELETE") {
      const { project_id, provider } = await req.json();

      if (!project_id || !provider) {
        throw new Error("Missing required fields: project_id, provider");
      }

      // Verify permissions
      const { data: project } = await serviceClient
        .from("projects")
        .select("org_id")
        .eq("id", project_id)
        .single();
      if (!project) throw new Error("Project not found");

      const { data: membership } = await serviceClient
        .from("org_memberships")
        .select("role")
        .eq("user_id", user.id)
        .eq("org_id", project.org_id)
        .single();

      const isSuperAdmin = await serviceClient.rpc("is_superadmin", { _user_id: user.id });
      const isAdmin = membership && ["owner", "admin"].includes(membership.role);

      if (!isSuperAdmin.data && !isAdmin) {
        throw new Error("Insufficient permissions");
      }

      // Get existing connection
      const { data: existing } = await serviceClient
        .from("project_connections")
        .select("id, api_key_secret_id")
        .eq("project_id", project_id)
        .eq("provider", provider)
        .maybeSingle();

      if (existing) {
        // Delete vault secret
        await serviceClient.rpc("vault_delete_secret", {
          secret_id: existing.api_key_secret_id,
        }).catch(() => {});

        // Delete connection row
        await serviceClient
          .from("project_connections")
          .delete()
          .eq("id", existing.id);
      }

      // Clear cached Notion workspace IDs when disconnecting Notion
      if (provider === "notion") {
        await serviceClient
          .from("projects")
          .update({
            notion_workspace_id: null,
            notion_calendar_db_id: null,
            notion_pillars_db_id: null,
            notion_foundations_db_id: null,
            notion_last_synced_at: null,
          })
          .eq("id", project_id);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

async function upsertConnection(
  client: any,
  existing: any,
  projectId: string,
  provider: string,
  secretId: string
) {
  if (existing) {
    await client
      .from("project_connections")
      .update({ api_key_secret_id: secretId, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await client
      .from("project_connections")
      .insert({
        project_id: projectId,
        provider,
        api_key_secret_id: secretId,
      });
  }
}
