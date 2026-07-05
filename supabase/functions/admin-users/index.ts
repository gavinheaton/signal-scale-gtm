import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const VALID_ROLES = ["superadmin", "owner", "admin", "manager", "analyst", "client"] as const;
type Role = typeof VALID_ROLES[number];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await anon.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify superadmin
    const { data: isSuper } = await service.rpc("is_superadmin", { _user_id: user.id });
    if (!isSuper) return json({ error: "Forbidden: superadmin only" }, 403);

    const { action, ...params } = await req.json();
    const callerId = user.id;

    switch (action) {
      case "list": {
        const { data: usersRes, error: listErr } = await service.auth.admin.listUsers({ perPage: 1000 });
        if (listErr) return json({ error: listErr.message }, 500);

        const { data: memberships } = await service.from("org_memberships").select("id, user_id, org_id, role");
        const { data: orgs } = await service.from("organisations").select("id, name");
        const orgMap = new Map((orgs || []).map((o: any) => [o.id, o.name]));

        const users = usersRes.users.map((u: any) => ({
          id: u.id,
          email: u.email,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
          confirmed_at: u.email_confirmed_at || u.confirmed_at,
          memberships: (memberships || [])
            .filter((m: any) => m.user_id === u.id)
            .map((m: any) => ({ id: m.id, org_id: m.org_id, org_name: orgMap.get(m.org_id) || "—", role: m.role })),
        }));
        return json({ users });
      }

      case "update_membership": {
        const { membership_id, role } = params;
        if (!membership_id || !VALID_ROLES.includes(role)) return json({ error: "Invalid input" }, 400);
        const { error } = await service.from("org_memberships").update({ role }).eq("id", membership_id);
        if (error) return json({ error: error.message }, 500);
        return json({ success: true });
      }

      case "remove_membership": {
        const { membership_id } = params;
        if (!membership_id) return json({ error: "membership_id required" }, 400);
        const { data: mem } = await service.from("org_memberships").select("user_id, role").eq("id", membership_id).maybeSingle();
        if (mem?.user_id === callerId && mem?.role === "superadmin") {
          return json({ error: "Cannot remove your own superadmin membership" }, 400);
        }
        const { error } = await service.from("org_memberships").delete().eq("id", membership_id);
        if (error) return json({ error: error.message }, 500);
        return json({ success: true });
      }

      case "add_membership": {
        const { user_id, org_id, role } = params;
        if (!user_id || !org_id || !VALID_ROLES.includes(role)) return json({ error: "Invalid input" }, 400);
        const { data: existing } = await service.from("org_memberships")
          .select("id").eq("user_id", user_id).eq("org_id", org_id).maybeSingle();
        if (existing) return json({ error: "User already a member of this org" }, 409);
        const { error } = await service.from("org_memberships").insert({ user_id, org_id, role });
        if (error) return json({ error: error.message }, 500);
        return json({ success: true });
      }

      case "set_superadmin": {
        const { user_id, promote } = params;
        if (!user_id) return json({ error: "user_id required" }, 400);
        if (user_id === callerId && !promote) return json({ error: "Cannot demote yourself" }, 400);

        if (promote) {
          // Find an existing org membership to attach superadmin role to
          const { data: existing } = await service.from("org_memberships")
            .select("id, org_id").eq("user_id", user_id).limit(1).maybeSingle();
          if (!existing) return json({ error: "Add this user to an organisation first, then promote to superadmin" }, 400);
          const { data: alreadySuper } = await service.from("org_memberships")
            .select("id").eq("user_id", user_id).eq("role", "superadmin").maybeSingle();
          if (alreadySuper) return json({ success: true, message: "Already superadmin" });
          const { error } = await service.from("org_memberships")
            .insert({ user_id, org_id: existing.org_id, role: "superadmin" });
          if (error) return json({ error: error.message }, 500);
          return json({ success: true });
        } else {
          const { error } = await service.from("org_memberships")
            .delete().eq("user_id", user_id).eq("role", "superadmin");
          if (error) return json({ error: error.message }, 500);
          return json({ success: true });
        }
      }

      case "reset_password": {
        const { email } = params;
        if (!email) return json({ error: "email required" }, 400);
        const { error } = await service.auth.admin.generateLink({ type: "recovery", email });
        if (error) return json({ error: error.message }, 500);
        return json({ success: true, message: "Password reset email sent" });
      }

      case "resend_invite": {
        const { email } = params;
        if (!email) return json({ error: "email required" }, 400);
        const { error } = await service.auth.admin.inviteUserByEmail(email);
        if (error) return json({ error: error.message }, 500);
        return json({ success: true, message: "Invite resent" });
      }

      case "delete_user": {
        const { user_id } = params;
        if (!user_id) return json({ error: "user_id required" }, 400);
        if (user_id === callerId) return json({ error: "Cannot delete yourself" }, 400);
        await service.from("org_memberships").delete().eq("user_id", user_id);
        const { error } = await service.auth.admin.deleteUser(user_id);
        if (error) return json({ error: error.message }, 500);
        return json({ success: true });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err: any) {
    return json({ error: err.message || "Server error" }, 500);
  }
});
