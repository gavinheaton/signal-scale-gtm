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
  aiJson, apexDomain, fcMap, fcScrapePage, loadProjectContext, marketExpectation,
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
const NON_ORGANISATION_LABEL = /^(learn more|read more|click here|website|visit|home|contact|download|privacy|terms|subscribe|share|open|view|source)$/i;

interface ExplicitLink {
  name: string;
  url: string;
  domain: string;
  sourceUrl: string;
}

function cleanLinkLabel(value: string): string {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Keep named external links independently of AI, so explicit partners cannot be omitted. */
function explicitOrganisationLinks(markdown: string, sourceUrl: string, ownApex: string): ExplicitLink[] {
  const candidates: ExplicitLink[] = [];
  const seen = new Set<string>();
  const pattern = /\[([^\]]{2,100})\]\((https?:\/\/[^\s)]+)(?:\s+["'][^"']*["'])?\)/g;
  for (const match of markdown.matchAll(pattern)) {
    const name = cleanLinkLabel(match[1]);
    const url = match[2].replace(/[.,;]+$/, "");
    const domain = apexDomain(url);
    if (!name || name.length < 3 || NON_ORGANISATION_LABEL.test(name)) continue;
    if (!domain || domain === ownApex || SOCIAL.test(domain) || seen.has(domain)) continue;

    // A partner/alliance label is definitive. Other title-like labels are retained
    // for the AI pass, which can classify them without being asked to rediscover them.
    const definitive = /\b(partner|partners|alliance|collaborator|member)\b/i.test(name);
    const titleLike = /^[A-Z0-9][A-Za-z0-9&'’.+\- ]{2,79}$/.test(name) && name.split(/\s+/).length <= 8;
    if (!definitive && !titleLike) continue;

    seen.add(domain);
    candidates.push({ name, url, domain, sourceUrl });
  }
  return candidates;
}

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

        const now = () => new Date().toISOString();
        let saved = 0;

        // Insert as we go so a long run never loses what it already found.
        const saveRows = async (rows: any[]) => {
          if (rows.length === 0) return;
          const { data: ins, error: insErr } = await sb.from("competitors").insert(rows).select("id");
          if (insErr) throw new Error(insErr.message);
          saved += ins?.length || rows.length;
          await sb.from("competitor_runs").update({ saved_count: saved }).eq("id", runId);
        };

        // ---------- Pass 1: the project's own website ----------
        let ownSiteFound = 0;
        const ownSite = typeof (context as any).website === "string" ? (context as any).website.trim() : "";
        if (ownSite) {
          const ownApex = apexDomain(ownSite);
          const pages = new Set<string>([`https://${ownApex}`]);
          for (const kw of ["partners", "about"]) {
            const found = await fcMap(`https://${ownApex}`, kw, 4);
            found.slice(0, 2).forEach((u) => pages.add(u));
            if (pages.size >= 4) break;
          }
          const scrapedAll = await Promise.all(Array.from(pages).slice(0, 4).map(async (u) => {
            const page = await fcScrapePage(u, 8000);
            return { url: u, markdown: page.markdown, links: page.links };
          }));
          const scraped = scrapedAll.filter((p) => p.markdown.length > 150);
          if (scraped.length > 0) {
            const explicitLinks = scraped.flatMap((p) => explicitOrganisationLinks(p.markdown, p.url, ownApex));
            const parsedOwn = await aiJson(OWN_SITE_SYSTEM, {
              site_owner: { name: context.project_name, domain: ownApex },
              expectation,
              pages: scraped,
              explicit_external_links: explicitLinks,
            });
            const orgs: any[] = Array.isArray(parsedOwn?.organisations) ? parsedOwn.organisations.slice(0, 10) : [];
            const ownRows: any[] = [];

            // Save links explicitly labelled as partnerships before AI results. This
            // guarantees that links such as "Value Advisory Partners" are retained.
            for (const link of explicitLinks.filter((item) => /\b(partner|partners|alliance|collaborator|member)\b/i.test(item.name))) {
              if (takenNames.has(link.name.toLowerCase()) || takenDomains.has(link.domain)) continue;
              takenNames.add(link.name.toLowerCase());
              takenDomains.add(link.domain);
              ownRows.push({
                project_id,
                name: link.name,
                domain: link.domain,
                type: "adjacent",
                status: "suggested",
                source: "own_site",
                why_suggested: "Linked as a partner on your website.",
                identity_verdict: "match",
                identity_reason: "Explicitly linked as a partner from your website.",
                evidence: [{ kind: "our_site_link", url: link.sourceUrl, linked_url: link.url, captured_at: now() }],
                confidence: "high",
              });
              ownSiteFound++;
            }

            for (const o of orgs) {
              const name = typeof o?.name === "string" ? o.name.trim() : "";
              if (!name || takenNames.has(name.toLowerCase())) continue;
              let domain = typeof o?.domain === "string" && o.domain.trim() ? apexDomain(o.domain) : null;
              if (domain && (domain === ownApex || SOCIAL.test(domain))) domain = null;
              if (domain && takenDomains.has(domain)) continue;
              takenNames.add(name.toLowerCase());
              if (domain) takenDomains.add(domain);
              ownRows.push({
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
            await saveRows(ownRows);
          }
        }

        // ---------- Pass 2: AI-proposed set ----------
        const parsed = await aiJson(SYSTEM, context);
        const proposed: any[] = Array.isArray(parsed.competitors) ? parsed.competitors.slice(0, 10) : [];
        if (proposed.length === 0 && saved === 0) {
          throw new Error("The AI could not propose competitors from the current project data.");
        }

        const fresh = proposed.filter((p) => {
          const name = typeof p?.name === "string" ? p.name.trim() : "";
          return name && !takenNames.has(name.toLowerCase());
        });

        // Resolve websites in small parallel batches — sequential lookups
        // outlive the function and the run would never finish.
        for (let i = 0; i < fresh.length; i += 4) {
          const batch = fresh.slice(i, i + 4);
          const resolved = await Promise.all(batch.map(async (p) => {
            const name = (p.name as string).trim();
            const type = ["direct", "adjacent", "in_house", "do_nothing"].includes(p?.type) ? p.type : "direct";
            if (type !== "direct" && type !== "adjacent") return { p, name, type, site: null, linkedin: null };
            try {
              const { site, linkedin } = await resolveCompanySite(name, expectation, {
                preferDomain: typeof p?.guess_domain === "string" ? p.guess_domain : null,
                maxCandidates: 2,
              });
              return { p, name, type, site, linkedin };
            } catch (e: any) {
              console.error("[competitor-discover] resolve failed", name, e?.message);
              return { p, name, type, site: null, linkedin: null };
            }
          }));

          const rows: any[] = [];
          for (const r of resolved) {
            if (takenNames.has(r.name.toLowerCase())) continue;
            let domain: string | null = null;
            const evidence: any[] = [];
            if (r.site?.verdict === "match" && r.site.domain) {
              domain = r.site.domain;
              evidence.push({ kind: "website", url: `https://${domain}`, captured_at: now() });
            }
            if (r.linkedin) evidence.push({ kind: "linkedin", url: r.linkedin, captured_at: now() });
            if (domain && takenDomains.has(domain)) continue;
            if (domain) takenDomains.add(domain);
            takenNames.add(r.name.toLowerCase());
            rows.push({
              project_id,
              name: r.name,
              domain,
              linkedin_url: r.linkedin,
              type: r.type,
              status: "suggested",
              source: "ai",
              why_suggested: typeof r.p?.why === "string" ? r.p.why.slice(0, 300) : null,
              identity_verdict: r.site?.verdict || null,
              identity_reason: r.site?.reason || null,
              evidence,
              confidence: domain ? "medium" : "low",
            });
          }
          await saveRows(rows);
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
