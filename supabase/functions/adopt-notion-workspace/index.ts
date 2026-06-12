import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";

interface AdoptBody {
  project_id: string;
  parent_page_id: string;
  calendar_db_id?: string | null;
  pillars_db_id?: string | null;
  foundations_db_id?: string | null;
  channel_db_ids?: Record<string, string>;
  property_map: {
    calendar?: Record<string, string>;
    pillars?: Record<string, string>;
    foundations?: Record<string, string>;
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const caller = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await caller.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json() as AdoptBody;
    if (!body?.project_id || !body?.parent_page_id || !body?.property_map) {
      return new Response(JSON.stringify({ error: "project_id, parent_page_id, property_map required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: project } = await admin
      .from("projects").select("org_id").eq("id", body.project_id).single();
    if (!project) {
      return new Response(JSON.stringify({ error: "Project not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: hasRole } = await admin.rpc("user_has_org_role", {
      _user_id: user.id, _org_id: project.org_id, _roles: ["admin", "owner", "superadmin"],
    });
    if (!hasRole) {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: updateErr } = await admin.from("projects").update({
      notion_parent_page_id: body.parent_page_id,
      notion_workspace_id: body.parent_page_id,
      notion_calendar_db_id: body.calendar_db_id || null,
      notion_pillars_db_id: body.pillars_db_id || null,
      notion_foundations_db_id: body.foundations_db_id || null,
      notion_channel_db_ids: body.channel_db_ids || {},
      notion_property_map: body.property_map || {},
      notion_last_synced_at: new Date().toISOString(),
    }).eq("id", body.project_id);

    if (updateErr) {
      return new Response(JSON.stringify({ error: updateErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
