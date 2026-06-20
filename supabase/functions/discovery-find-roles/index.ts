// Find role-holders at an org using Firecrawl scrape + AI matching to campaign personas.
import { corsHeaders } from "../_shared/cors.ts";
import { requireUser, serviceClient, assertProjectAccess } from "../_shared/auth.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY")!;

interface Body { organization_id: string }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    let user;
    try { ({ user } = await requireUser(req, corsHeaders)); }
    catch (r) { return r as Response; }
    const { organization_id }: Body = await req.json();
    if (!organization_id) return json({ error: "organization_id required" }, 400);

    const sb = serviceClient();
    const { data: org, error } = await sb.from("discovery_organizations")
      .select("*, discovery_campaigns!inner(project_id, persona_ids)")
      .eq("id", organization_id).maybeSingle();
    if (error || !org) return json({ error: "Org not found" }, 404);
    const projectId = (org as any).discovery_campaigns.project_id;
    try { await assertProjectAccess(sb, user.id, projectId); }
    catch (e: any) { return json({ error: e?.message || "Forbidden" }, 403); }

    const personaIds = (org as any).discovery_campaigns.persona_ids || [];
    const { data: personas } = personaIds.length
      ? await sb.from("personas").select("id, persona_name, role_in_buying, organisational_context").in("id", personaIds)
      : { data: [] as any[] };

    if (!FIRECRAWL_API_KEY) return json({ error: "FIRECRAWL_API_KEY not configured" }, 500);
    if (!org.domain) return json({ error: "Org has no domain; add one to scan team pages" }, 400);

    // Map the site to find about/team/leadership pages
    const mapRes = await fetch("https://api.firecrawl.dev/v2/map", {
      method: "POST",
      headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: `https://${org.domain}`, search: "team leadership about people", limit: 10 }),
    });
    const mapData = mapRes.ok ? await mapRes.json() : { links: [] };
    const allLinks = (mapData?.links || []) as any[];
    const candidates = allLinks
      .map((l) => typeof l === "string" ? l : l.url)
      .filter((u: string) => /team|leadership|about|people|company|management/i.test(u))
      .slice(0, 4);

    // Always include homepage as fallback
    if (candidates.length === 0) candidates.push(`https://${org.domain}`);

    // Scrape each
    const scrapes = await Promise.all(candidates.map(async (url) => {
      try {
        const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
          method: "POST",
          headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
        });
        if (!r.ok) return null;
        const d = await r.json();
        return { url, markdown: (d?.markdown || d?.data?.markdown || "").slice(0, 6000) };
      } catch { return null; }
    }));
    const pages = scrapes.filter(Boolean);
    if (pages.length === 0) return json({ candidates: [] });

    const ai = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: `You extract role-holders at a company and map them to target personas. Return ONLY JSON: {"candidates":[{"persona_id":string|null,"role_title":string,"source_url":string,"source_snippet":string}]}. persona_id MUST be one of the provided persona ids, or null if no good match. role_title is the actual scraped title. source_snippet is a short verbatim quote (<=200 chars).` },
          { role: "user", content: JSON.stringify({
            personas: (personas || []).map((p) => ({ id: p.id, name: p.persona_name, role: p.role_in_buying })),
            pages,
          }) },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!ai.ok) return json({ error: `AI failed: ${ai.status}` }, 502);
    const aiData = await ai.json();
    let parsed: any = {};
    try { parsed = JSON.parse(aiData?.choices?.[0]?.message?.content); } catch { /* ignore */ }
    return json({ candidates: parsed.candidates || [] });
  } catch (e: any) {
    console.error(e);
    return json({ error: e?.message || "Internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
