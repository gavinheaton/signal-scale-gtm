// Enrich a discovery_org_roles row into named contacts via Apollo People Search.
import { corsHeaders } from "../_shared/cors.ts";
import { requireUser, serviceClient, assertProjectAccess } from "../_shared/auth.ts";

const APOLLO_API_KEY = Deno.env.get("APOLLO_API_KEY")!;

interface Body { org_role_id: string }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    let user;
    try { ({ user } = await requireUser(req, corsHeaders)); }
    catch (r) { return r as Response; }
    const { org_role_id }: Body = await req.json();
    if (!org_role_id) return json({ error: "org_role_id required" }, 400);
    if (!APOLLO_API_KEY) return json({ error: "APOLLO_API_KEY not configured" }, 500);

    const sb = serviceClient();
    const { data: role, error } = await sb.from("discovery_org_roles")
      .select("*, discovery_organizations!inner(name, domain, discovery_campaigns!inner(project_id))")
      .eq("id", org_role_id).maybeSingle();
    if (error || !role) return json({ error: "Role not found" }, 404);
    const projectId = (role as any).discovery_organizations.discovery_campaigns.project_id;
    try { await assertProjectAccess(sb, user.id, projectId); }
    catch (e: any) { return json({ error: e?.message || "Forbidden" }, 403); }

    const org = (role as any).discovery_organizations;
    // Apollo People Search (mixed_people/search)
    const body = {
      api_key: APOLLO_API_KEY,
      q_organization_domains: org.domain ? org.domain : undefined,
      person_titles: [role.role_title],
      per_page: 10,
    };
    const res = await fetch("https://api.apollo.io/v1/mixed_people/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cache-Control": "no-cache", "X-Api-Key": APOLLO_API_KEY },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text();
      return json({ error: `Apollo failed: ${res.status} ${t.slice(0, 200)}` }, 502);
    }
    const data = await res.json();
    const people = (data?.people || data?.contacts || []) as any[];
    const candidates = people.slice(0, 10).map((p) => ({
      name: p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim(),
      title: p.title,
      email: p.email || null,
      linkedin_url: p.linkedin_url || null,
      seniority: p.seniority || null,
      apollo_person_id: p.id,
    }));
    return json({ candidates });
  } catch (e: any) {
    console.error(e);
    return json({ error: e?.message || "Internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
