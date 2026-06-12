import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import { PROPRESENCE_BASE } from "../_shared/propresence.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const service = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json().catch(() => ({}));
    const { project_id } = body;
    if (!project_id) throw new Error("project_id required");

    // Permission check: admin/owner/superadmin of project's org
    const { data: project } = await service.from("projects").select("org_id").eq("id", project_id).single();
    if (!project) throw new Error("Project not found");
    const { data: membership } = await service.from("org_memberships")
      .select("role").eq("user_id", user.id).eq("org_id", project.org_id).maybeSingle();
    const { data: isSuper } = await service.rpc("is_superadmin", { _user_id: user.id });
    const allowed = isSuper || (membership && ["owner", "admin"].includes(membership.role));
    if (!allowed) throw new Error("Insufficient permissions");

    if (req.method === "POST") {
      const { api_key, target } = body;
      if (!api_key) throw new Error("api_key required");
      const safeTarget = target === "personal" ? "personal" : "company";

      // Validate by hitting ProPresence tone endpoint (GET-ish — try lightweight call)
      const validateRes = await fetch(`${PROPRESENCE_BASE}/tone-api?target=${safeTarget}`, {
        method: "GET",
        headers: { "X-API-Key": api_key },
      });
      if (validateRes.status === 401 || validateRes.status === 403) {
        throw new Error("Invalid ProPresence API key");
      }
      // Anything else (200, 404, even 405) means the key was accepted — proceed.

      // Find existing connection
      const { data: existing } = await service.from("project_connections")
        .select("id, api_key_secret_id")
        .eq("project_id", project_id).eq("provider", "propresence").maybeSingle();

      if (existing) {
        await service.rpc("vault_delete_secret", { secret_id: existing.api_key_secret_id }).catch(() => {});
      }

      const secretName = `project_${project_id}_propresence_api_key_${Date.now()}`;
      const { data: secretId, error: vaultErr } = await service.rpc("vault_create_secret", {
        new_secret: api_key,
        new_name: secretName,
        new_description: `ProPresence API key for project ${project_id}`,
      });
      if (vaultErr) throw new Error("Failed to store secret in vault");

      if (existing) {
        await service.from("project_connections")
          .update({ api_key_secret_id: secretId, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
      } else {
        await service.from("project_connections").insert({
          project_id, provider: "propresence", api_key_secret_id: secretId,
        });
      }

      await service.from("projects")
        .update({ propresence_target: safeTarget })
        .eq("id", project_id);

      return new Response(JSON.stringify({ success: true, target: safeTarget }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "PATCH") {
      const { target } = body;
      const safeTarget = target === "personal" ? "personal" : "company";
      await service.from("projects").update({ propresence_target: safeTarget }).eq("id", project_id);
      return new Response(JSON.stringify({ success: true, target: safeTarget }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "DELETE") {
      const { data: existing } = await service.from("project_connections")
        .select("id, api_key_secret_id")
        .eq("project_id", project_id).eq("provider", "propresence").maybeSingle();
      if (existing) {
        await service.rpc("vault_delete_secret", { secret_id: existing.api_key_secret_id }).catch(() => {});
        await service.from("project_connections").delete().eq("id", existing.id);
      }
      await service.from("projects")
        .update({ propresence_tone_synced_at: null })
        .eq("id", project_id);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("manage-propresence-connection error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
