import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = claimsData.claims.sub as string;

    // Parse body
    const { email, role, org_id } = await req.json();
    if (!email || !role || !org_id) {
      return new Response(JSON.stringify({ error: "email, role, and org_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validRoles = ["admin", "manager", "analyst", "client"];
    if (!validRoles.includes(role)) {
      return new Response(JSON.stringify({ error: `Invalid role. Must be one of: ${validRoles.join(", ")}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service role client for admin operations
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check caller is superadmin OR admin/owner of the target org
    const { data: callerMemberships } = await serviceClient
      .from("org_memberships")
      .select("role, org_id")
      .eq("user_id", callerId);

    const isSuperAdmin = callerMemberships?.some((m: any) => m.role === "superadmin");
    const isOrgAdmin = callerMemberships?.some(
      (m: any) => m.org_id === org_id && ["owner", "admin"].includes(m.role)
    );

    if (!isSuperAdmin && !isOrgAdmin) {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Invite user via Supabase Admin API
    const { data: inviteData, error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(email);

    if (inviteError) {
      // If user already exists, get their ID
      if (inviteError.message?.includes("already been registered")) {
        const { data: existingUsers } = await serviceClient.auth.admin.listUsers();
        const existingUser = existingUsers?.users?.find((u: any) => u.email === email);
        if (existingUser) {
          // Check if membership already exists
          const { data: existingMem } = await serviceClient
            .from("org_memberships")
            .select("id")
            .eq("user_id", existingUser.id)
            .eq("org_id", org_id)
            .maybeSingle();

          if (existingMem) {
            return new Response(JSON.stringify({ error: "User is already a member of this organisation" }), {
              status: 409,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          // Add membership for existing user
          const { error: memError } = await serviceClient.from("org_memberships").insert({
            user_id: existingUser.id,
            org_id,
            role,
          });

          if (memError) {
            return new Response(JSON.stringify({ error: memError.message }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          return new Response(JSON.stringify({ success: true, message: "Existing user added to organisation" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      return new Response(JSON.stringify({ error: inviteError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create org membership for the newly invited user
    if (inviteData?.user) {
      const { error: memError } = await serviceClient.from("org_memberships").insert({
        user_id: inviteData.user.id,
        org_id,
        role,
      });

      if (memError) {
        return new Response(JSON.stringify({ error: `User invited but membership creation failed: ${memError.message}` }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ success: true, message: `Invite sent to ${email}` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
