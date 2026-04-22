import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Flavor = "wordpress_com" | "self_hosted";

interface PostBody {
  org_id: string;
  flavor: Flavor;
  site_url: string;
  username?: string;
  credential: string; // OAuth token (wp.com) OR application password (self-hosted)
  default_category?: string | null;
  default_status?: string;
}

interface DeleteBody {
  org_id: string;
}

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normaliseSelfHostedBase(url: string) {
  return url.replace(/\/+$/, "");
}

async function validateCredentials(payload: PostBody): Promise<{ ok: boolean; error?: string }> {
  try {
    if (payload.flavor === "wordpress_com") {
      const res = await fetch("https://public-api.wordpress.com/rest/v1.1/me", {
        headers: { Authorization: `Bearer ${payload.credential}` },
      });
      if (!res.ok) {
        const t = await res.text();
        return { ok: false, error: `WordPress.com auth failed [${res.status}]: ${t.slice(0, 200)}` };
      }
      return { ok: true };
    }
    // self-hosted
    if (!payload.username) return { ok: false, error: "Username required for self-hosted WordPress" };
    const base = normaliseSelfHostedBase(payload.site_url);
    const auth = btoa(`${payload.username}:${payload.credential}`);
    const res = await fetch(`${base}/wp-json/wp/v2/users/me?context=edit`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, error: `WordPress auth failed [${res.status}]: ${t.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: `Could not reach WordPress: ${e?.message || e}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Auth: identify caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonRes({ error: "Missing Authorization" }, 401);
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return jsonRes({ error: "Unauthorised" }, 401);
    const userId = userData.user.id;

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Permission check helper
    async function assertOrgAdmin(orgId: string) {
      const { data: isSuper } = await sb.rpc("is_superadmin", { _user_id: userId });
      if (isSuper) return;
      const { data: hasRole } = await sb.rpc("user_has_org_role", {
        _user_id: userId, _org_id: orgId, _roles: ["owner", "admin"],
      });
      if (!hasRole) throw new Error("Forbidden: org admin role required");
    }

    if (req.method === "POST") {
      const body: PostBody = await req.json();
      if (!body.org_id || !body.flavor || !body.site_url || !body.credential) {
        return jsonRes({ error: "org_id, flavor, site_url and credential required" }, 400);
      }
      await assertOrgAdmin(body.org_id);

      // Validate credentials before storing
      const v = await validateCredentials(body);
      if (!v.ok) return jsonRes({ error: v.error }, 400);

      // Look up existing connection (for update path — we need to delete the old vault secret)
      const { data: existing } = await sb
        .from("org_wordpress_connections")
        .select("id, credential_secret_id")
        .eq("org_id", body.org_id)
        .maybeSingle();

      // Create vault secret
      const secretName = `wp_${body.org_id}_${Date.now()}`;
      const { data: secretId, error: secretErr } = await sb.rpc("vault_create_secret", {
        new_secret: body.credential,
        new_name: secretName,
        new_description: `WordPress credential for org ${body.org_id}`,
      });
      if (secretErr || !secretId) {
        return jsonRes({ error: `Failed to store credential: ${secretErr?.message}` }, 500);
      }

      const row = {
        org_id: body.org_id,
        flavor: body.flavor,
        site_url: body.site_url,
        username: body.username ?? null,
        credential_secret_id: secretId as unknown as string,
        default_category: body.default_category ?? null,
        default_status: body.default_status || "draft",
        connected_by: userId,
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        const { error: updErr } = await sb
          .from("org_wordpress_connections")
          .update(row)
          .eq("id", existing.id);
        if (updErr) return jsonRes({ error: updErr.message }, 500);
        // Best-effort cleanup of old secret
        if (existing.credential_secret_id) {
          await sb.rpc("vault_delete_secret", { secret_id: existing.credential_secret_id });
        }
      } else {
        const { error: insErr } = await sb
          .from("org_wordpress_connections")
          .insert({ ...row, connected_at: new Date().toISOString() });
        if (insErr) return jsonRes({ error: insErr.message }, 500);
      }

      return jsonRes({ success: true });
    }

    if (req.method === "DELETE") {
      const body: DeleteBody = await req.json();
      if (!body.org_id) return jsonRes({ error: "org_id required" }, 400);
      await assertOrgAdmin(body.org_id);

      const { data: existing } = await sb
        .from("org_wordpress_connections")
        .select("id, credential_secret_id")
        .eq("org_id", body.org_id)
        .maybeSingle();
      if (!existing) return jsonRes({ success: true });

      await sb.from("org_wordpress_connections").delete().eq("id", existing.id);
      if (existing.credential_secret_id) {
        await sb.rpc("vault_delete_secret", { secret_id: existing.credential_secret_id });
      }
      return jsonRes({ success: true });
    }

    return jsonRes({ error: "Method not allowed" }, 405);
  } catch (e: any) {
    console.error("manage-org-wordpress-connection error:", e);
    const msg = e?.message || "Unknown error";
    const status = msg.startsWith("Forbidden") ? 403 : 500;
    return jsonRes({ error: msg }, status);
  }
});
