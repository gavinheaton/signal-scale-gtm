// Propose likely competitors for a project, verify their websites, and save them
// as "suggested" rows for the user to confirm. Runs as a background job.
//
// Two passes:
//  1. Own-site pass — read the project's own website for named partners, alternatives
//     and comparable organisations (these are already verified as real).
//  2. AI pass — propose the rest of the competitive set from project context.
// Every proposed website goes through a sector identity check before it is accepted.
import { corsHeaders } from "../_shared/cors.ts";
import { requireUser, serviceClient, assertProjectAccess } from "../_shared/auth.ts";
import {
  aiJson, apexDomain, fcMap, fcScrape, loadProjectContext, marketExpectation,
  resolveCompanySite, AiError,
} from "../_shared/competitorAi.ts";

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

const OWN_SITE_SYSTEM = `You read a company's own website and list the OTHER organisations it names or links to.

Return ONLY JSON: {"organisations":[{"name":string,"domain":string|null,"why":string,"type":"direct"|"adjacent"}]}

RULES:
- Include partners, alliance members, named alternatives, comparison targets, and organisations doing similar work that are named or linked on these pages.
- EXCLUDE the site owner itself, social networks, analytics/CDN/hosting vendors, website builders, generic software tools, media publications, government departments and industry bodies that are not service providers.
- "domain" is the apex domain if it appears in the page content or link, otherwise null. Never invent one.
- "type": "direct" if they appear to offer the same service, otherwise "adjacent".
- "why" is one short sentence, max 20 words, saying where they appeared and why they matter.
- Max 10 organisations. Return an empty array if none qualify.`;

const SOCIAL = /linkedin\.com|facebook\.com|instagram\.com|x\.com|twitter\.com|youtube\.com|vimeo\.com|tiktok\.com|google\.com|gstatic|cloudflare|wordpress\.|wix\.|squarespace\.|hubspot\.|mailchimp|calendly|eventbrite|apple\.com|microsoft\.com/i;

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
        const expectation = marketExpectation(context);

        const { data: existing } = await sb
          .from("competitors").select("name, domain").eq("project_id", project_id);
        const takenNames = new Set((existing || []).map((c: any) => (c.name || "").toLowerCase()));
        const takenDomains = new Set((existing || []).map((c: any) => (c.domain || "").toLowerCase()).filter(Boolean));

        const rows: any[] = [];
        const now = () => new Date().toISOString();

        // ---------- Pass 1: the project's own website ----------
        let ownSiteFound = 0;
        const ownSite = typeof (context as any).website === "string" ? (context as any).website.trim() : "";
        if (ownSite) {
          const ownApex = apexDomain(ownSite);
          const pages = new Set<string>([`https://${ownApex}`]);
          for (const kw of ["partners", "about", "services", "ecosystem"]) {
            const found = await fcMap(`https://${ownApex}`, kw, 6);
            found.slice(0, 2).forEach((u) => pages.add(u));
            if (pages.size >= 6) break;
          }
          const scraped: { url: string; markdown: string }[] = [];
          for (const u of Array.from(pages).slice(0, 6)) {
            const md = await fcScrape(u, 5000);
            if (md.length > 150) scraped.push({ url: u, markdown: md });
          }
          if (scraped.length > 0) {
            const parsedOwn = await aiJson(OWN_SITE_SYSTEM, {
              site_owner: { name: context.project_name, domain: ownApex },
              expectation,
              pages: scraped,
            });
            const orgs: any[] = Array.isArray(parsedOwn?.organisations) ? parsedOwn.organisations.slice(0, 10) : [];
            for (const o of orgs) {
              const name = typeof o?.name === "string" ? o.name.trim() : "";
              if (!name || takenNames.has(name.toLowerCase())) continue;
              let domain = typeof o?.domain === "string" && o.domain.trim() ? apexDomain(o.domain) : null;
              if (domain && (domain === ownApex || SOCIAL.test(domain))) domain = null;
              if (domain && takenDomains.has(domain)) continue;
              takenNames.add(name.toLowerCase());
              if (domain) takenDomains.add(domain);
              rows.push({
                project_id,
                name,
                domain,
                type: o?.type === "adjacent" ? "adjacent" : "direct",
                status: "suggested",
                source: "own_site",
                why_suggested: typeof o?.why === "string" ? o.why.slice(0, 300) : "Named on your own website.",
                identity_verdict: domain ? "match" : "unsure",
                identity_reason: domain ? "Linked from your own website." : "Named on your website but no web address found.",
                evidence: scraped.slice(0, 2).map((p) => ({ kind: "our_site", url: p.url, captured_at: now() })),
                confidence: domain ? "high" : "medium",
              });
              ownSiteFound++;
            }
          }
        }

        // ---------- Pass 2: AI-proposed set ----------
        const parsed = await aiJson(SYSTEM, context);
        const proposed: any[] = Array.isArray(parsed.competitors) ? parsed.competitors.slice(0, 12) : [];
        if (proposed.length === 0 && rows.length === 0) {
          throw new Error("The AI could not propose competitors from the current project data.");
        }

        for (const p of proposed) {
          const name = typeof p?.name === "string" ? p.name.trim() : "";
          if (!name || takenNames.has(name.toLowerCase())) continue;
          const type = ["direct", "adjacent", "in_house", "do_nothing"].includes(p?.type) ? p.type : "direct";

          let domain: string | null = null;
          let linkedin: string | null = null;
          let verdict: string | null = null;
          let reason: string | null = null;
          const evidence: any[] = [];

          if (type === "direct" || type === "adjacent") {
            const { site, linkedin: li } = await resolveCompanySite(name, expectation, {
              preferDomain: typeof p?.guess_domain === "string" ? p.guess_domain : null,
            });
            verdict = site.verdict;
            reason = site.reason || null;
            linkedin = li;
            if (site.verdict === "match" && site.domain) {
              domain = site.domain;
              evidence.push({ kind: "website", url: `https://${site.domain}`, captured_at: now() });
            }
            if (linkedin) evidence.push({ kind: "linkedin", url: linkedin, captured_at: now() });
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
            source: "ai",
            why_suggested: typeof p?.why === "string" ? p.why.slice(0, 300) : null,
            identity_verdict: verdict,
            identity_reason: reason,
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
          result: { proposed: proposed.length, from_own_site: ownSiteFound, saved, own_site: ownSite || null },
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
