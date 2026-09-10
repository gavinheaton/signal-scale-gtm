// Research a list of organisation names supplied by the user: find each one's real
// website, verify the sector, assign an archetype, and save it for review.
// Runs as a background job so a long list never times out the request.
import { corsHeaders } from "../_shared/cors.ts";
import { requireUser, serviceClient, assertProjectAccess } from "../_shared/auth.ts";
import {
  apexDomain, classifyArchetypes, loadProjectContext, marketExpectation,
  resolveCompanySite, AiError,
} from "../_shared/competitorAi.ts";

interface Body { project_id: string; names: string[] }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    let user;
    try { ({ user } = await requireUser(req, corsHeaders)); }
    catch (r) { return r as Response; }

    const { project_id, names }: Body = await req.json();
    if (!project_id) return json({ error: "project_id required" }, 400);
    const wanted = (Array.isArray(names) ? names : [])
      .map((n) => (typeof n === "string" ? n.trim() : ""))
      .filter((n) => n.length > 1)
      .slice(0, 30);
    if (wanted.length === 0) return json({ error: "Add at least one name." }, 400);

    const sb = serviceClient();
    try { await assertProjectAccess(sb, user.id, project_id); }
    catch (e: any) { return json({ error: e?.message || "Forbidden" }, 403); }

    const { data: run, error: runErr } = await sb
      .from("competitor_runs")
      .insert({ project_id, kind: "seed", status: "running", created_by: user.id })
      .select("id").single();
    if (runErr || !run) return json({ error: runErr?.message || "Could not start research" }, 500);
    const runId = run.id as string;

    const background = (async () => {
      try {
        const context = await loadProjectContext(sb, project_id);
        const expectation = marketExpectation(context);
        const field = [expectation.what_they_do, expectation.sector].filter(Boolean).join(" — ").slice(0, 300);

        const { data: existing } = await sb
          .from("competitors").select("name, domain").eq("project_id", project_id);
        const takenNames = new Set((existing || []).map((c: any) => (c.name || "").toLowerCase()));
        const takenDomains = new Set((existing || []).map((c: any) => (c.domain || "").toLowerCase()).filter(Boolean));

        const fresh = wanted.filter((n) => {
          if (takenNames.has(n.toLowerCase())) return false;
          takenNames.add(n.toLowerCase());
          return true;
        });

        const archetypes = await classifyArchetypes(fresh.map((name) => ({ name })), { field });

        const now = () => new Date().toISOString();
        let saved = 0;

        for (let i = 0; i < fresh.length; i += 4) {
          const batch = fresh.slice(i, i + 4);
          const resolved = await Promise.all(batch.map(async (name) => {
            try {
              const { site, linkedin } = await resolveCompanySite(name, expectation, { maxCandidates: 2 });
              return { name, site, linkedin };
            } catch (e: any) {
              console.error("[competitor-seed] resolve failed", name, e?.message);
              return { name, site: null, linkedin: null };
            }
          }));

          const rows = resolved.map((r) => {
            const domain = r.site?.verdict === "match" && r.site.domain ? apexDomain(r.site.domain) : null;
            if (domain && takenDomains.has(domain)) return null;
            if (domain) takenDomains.add(domain);
            const evidence: any[] = [];
            if (domain) evidence.push({ kind: "website", url: `https://${domain}`, captured_at: now() });
            if (r.linkedin) evidence.push({ kind: "linkedin", url: r.linkedin, captured_at: now() });
            return {
              project_id,
              name: r.name,
              domain,
              linkedin_url: r.linkedin,
              type: "adjacent",
              archetype: archetypes[r.name.toLowerCase()] || "other",
              status: "suggested",
              source: "manual",
              why_suggested: "Added by you for research.",
              identity_verdict: r.site?.verdict || "unsure",
              identity_reason: r.site?.reason || null,
              evidence,
              confidence: domain ? "high" : "low",
            };
          }).filter(Boolean);

          if (rows.length > 0) {
            const { data: ins, error: insErr } = await sb.from("competitors").insert(rows as any[]).select("id");
            if (insErr) throw new Error(insErr.message);
            saved += ins?.length || rows.length;
            await sb.from("competitor_runs").update({ saved_count: saved }).eq("id", runId);
          }
        }

        await sb.from("competitor_runs").update({
          status: "complete",
          saved_count: saved,
          result: { requested: wanted.length, saved },
        }).eq("id", runId);
      } catch (e: any) {
        console.error("[competitor-seed] failed", e?.message);
        await sb.from("competitor_runs").update({
          status: "error",
          error: e instanceof AiError ? e.message : (e?.message || "Research failed"),
        }).eq("id", runId);
      }
    })();

    const rt = (globalThis as any).EdgeRuntime;
    if (rt?.waitUntil) rt.waitUntil(background);

    return json({ run_id: runId, status: "running" }, 202);
  } catch (e: any) {
    console.error(e);
    return json({ error: e?.message || "Internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
