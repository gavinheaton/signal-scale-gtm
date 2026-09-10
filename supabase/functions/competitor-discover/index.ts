// Propose likely competitors for a project, verify their websites, and save them
// as "suggested" rows for the user to confirm. Runs as a background job.
import { corsHeaders } from "../_shared/cors.ts";
import { requireUser, serviceClient, assertProjectAccess } from "../_shared/auth.ts";
import { aiJson, apexDomain, fcSearch, fcScrape, loadProjectContext, AiError } from "../_shared/competitorAi.ts";

interface Body { project_id: string }

const SYSTEM = `You identify the competitive set for a B2B go-to-market strategy.

Return ONLY JSON: {"competitors":[{"name":string,"type":"direct"|"adjacent"|"in_house"|"do_nothing","why":string,"guess_domain":string|null}]}

RULES:
- Propose 6 to 10 entries the buyers described in the context would realistically evaluate INSTEAD of this business.
- "direct" = solves the same problem the same way. "adjacent" = solves it differently or partially. "in_house" = the buyer builds/does it themselves (name it plainly, e.g. "In-house analyst team / spreadsheets"). "do_nothing" = the status quo of not acting.
- Include at least one "in_house" and exactly one "do_nothing" entry.
- Real companies only for direct/adjacent — never invent a company. If you are unsure a company exists, leave it out.
- "guess_domain" is your best-guess apex domain (e.g. "acme.com") or null. Never invent a domain to look complete.
- "why" is one sentence, max 25 words, explaining why this buyer would consider it.
- Favour companies operating in the geographies and segments named in the context.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    let user;
    try { ({ user } = await requireUser(req, corsHeaders)); }
    catch (r) { return r as Response; }

    const { project_id }: Body = await req.json();
    if (!project_id) return json({ error: "project_id required" }, 400);

    const sb = serviceClient();
    try { await assertProjectAccess(sb, user.id, project_id); }
    catch (e: any) { return json({ error: e?.message || "Forbidden" }, 403); }

    const { data: run, error: runErr } = await sb
      .from("competitor_runs")
      .insert({ project_id, kind: "discover", status: "running", created_by: user.id })
      .select("id").single();
    if (runErr || !run) return json({ error: runErr?.message || "Could not start research" }, 500);
    const runId = run.id as string;

    const background = (async () => {
      try {
        const context = await loadProjectContext(sb, project_id);
        const parsed = await aiJson(SYSTEM, context);
        const proposed: any[] = Array.isArray(parsed.competitors) ? parsed.competitors.slice(0, 12) : [];
        if (proposed.length === 0) throw new Error("The AI could not propose competitors from the current project data.");

        const { data: existing } = await sb
          .from("competitors").select("name, domain").eq("project_id", project_id);
        const takenNames = new Set((existing || []).map((c: any) => (c.name || "").toLowerCase()));
        const takenDomains = new Set((existing || []).map((c: any) => (c.domain || "").toLowerCase()).filter(Boolean));

        const rows: any[] = [];
        for (const p of proposed) {
          const name = typeof p?.name === "string" ? p.name.trim() : "";
          if (!name || takenNames.has(name.toLowerCase())) continue;
          const type = ["direct", "adjacent", "in_house", "do_nothing"].includes(p?.type) ? p.type : "direct";

          let domain: string | null = null;
          let linkedin: string | null = null;
          const evidence: any[] = [];

          if (type === "direct" || type === "adjacent") {
            // Verify the website: search, then confirm the page actually names the company.
            const hits = await fcSearch(`${name} official website`, 5);
            const guess = typeof p?.guess_domain === "string" && p.guess_domain.trim()
              ? apexDomain(p.guess_domain) : null;
            const candidates = hits
              .map((h) => ({ ...h, apex: apexDomain(h.url) }))
              .filter((h) => !h.apex.endsWith("wikipedia.org"));
            const li = candidates.find((h) => h.apex === "linkedin.com" && /\/company\//i.test(h.url));
            if (li) linkedin = li.url.split("?")[0];
            const preferred = candidates.find((h) => guess && h.apex === guess)
              || candidates.find((h) => h.apex !== "linkedin.com");
            if (preferred) {
              const md = await fcScrape(`https://${preferred.apex}`, 3000);
              const nameTokens = name.toLowerCase().split(/\s+/).filter((t) => t.length > 3);
              const hay = (md + " " + preferred.title).toLowerCase();
              const matches = nameTokens.length === 0 || nameTokens.some((t) => hay.includes(t));
              if (matches && md.length > 100) {
                domain = preferred.apex;
                evidence.push({ kind: "website", url: `https://${preferred.apex}`, captured_at: new Date().toISOString() });
              }
            }
            if (linkedin) evidence.push({ kind: "linkedin", url: linkedin, captured_at: new Date().toISOString() });
          }

          if (domain && takenDomains.has(domain)) continue;
          if (domain) takenDomains.add(domain);
          takenNames.add(name.toLowerCase());

          rows.push({
            project_id,
            name,
            domain,
            linkedin_url: linkedin,
            type,
            status: "suggested",
            why_suggested: typeof p?.why === "string" ? p.why.slice(0, 300) : null,
            evidence,
            confidence: domain ? "medium" : "low",
          });
        }

        let saved = 0;
        if (rows.length > 0) {
          const { data: ins, error: insErr } = await sb.from("competitors").insert(rows).select("id");
          if (insErr) throw new Error(insErr.message);
          saved = ins?.length || rows.length;
        }

        await sb.from("competitor_runs").update({
          status: "complete",
          saved_count: saved,
          result: { proposed: proposed.length, saved },
        }).eq("id", runId);
      } catch (e: any) {
        console.error("[competitor-discover] failed", e?.message);
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
