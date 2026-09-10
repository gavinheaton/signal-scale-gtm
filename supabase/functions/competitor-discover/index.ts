// Propose the organisations working on the same problem as this project, verify
// their websites, and save them as "suggested" rows for the user to confirm.
// Runs as a background job.
//
// Three passes:
//  1. Own-site pass — read the project's own website for named partners, alternatives
//     and comparable organisations (these are already verified as real).
//  2. Web search pass — search the live web per archetype (Australia-weighted first,
//     then global) so coalitions, alliances and research bodies are actually found.
//  3. AI pass — fill remaining gaps per archetype from project context.
// Every proposed website goes through a sector identity check before it is accepted.
import { corsHeaders } from "../_shared/cors.ts";
import { requireUser, serviceClient, assertProjectAccess } from "../_shared/auth.ts";
import {
  aiJson, apexDomain, ARCHETYPES, ARCHETYPE_KEYS, Archetype, classifyArchetypes,
  fcMap, fcScrapePage, fcSearch, loadProjectContext, marketExpectation,
  resolveCompanySite, verifySiteIdentity, AiError,
} from "../_shared/competitorAi.ts";

interface Body { project_id: string }

const ARCHETYPE_BRIEF = ARCHETYPES.map((a) => `- ${a.key} (${a.label}): ${a.description}`).join("\n");

const SYSTEM = `You map the full set of organisations working on the same problem as a business.

Return ONLY JSON: {"competitors":[{"name":string,"type":"direct"|"adjacent"|"in_house"|"do_nothing","archetype":string,"why":string,"guess_domain":string|null}]}

ARCHETYPES (use the key):
${ARCHETYPE_BRIEF}
- other: fits none of the above.

RULES:
- Propose 10 to 16 real organisations spread across ALL FOUR archetypes — at least two per archetype.
- Include commercial firms AND non-commercial coalitions, alliances, city networks, funds, programmes and research institutes. Non-commercial bodies count: they compete for the same mandate, funding and credibility.
- "direct" = works on the same problem the same way. "adjacent" = works on it differently or partially. "in_house" = the buyer does it themselves. "do_nothing" = the status quo.
- Include exactly one "in_house" and exactly one "do_nothing" entry (archetype "other").
- Real organisations only — never invent one. If you are unsure it exists, leave it out.
- "guess_domain" is your best-guess apex domain (e.g. "acme.com") or null. Never invent a domain to look complete.
- "why" is one sentence, max 25 words.
- Rank organisations active in the named geographies first, but include globally significant ones too.`;

const QUERY_SYSTEM = `You write web search queries to find organisations working on a specific problem.

Return ONLY JSON: {"queries":[{"archetype":string,"scope":"local"|"global","query":string}]}

ARCHETYPES (use the key):
${ARCHETYPE_BRIEF}

RULES:
- Write 2 queries per archetype: one "local" (includes the named geography) and one "global".
- Each query must read like something a researcher would type to list real named organisations — not a market or industry description.
- Keep each query under 12 words. No quotes, no boolean operators.`;

const EXTRACT_SYSTEM = `You read web search results and list the real ORGANISATIONS they name.

Return ONLY JSON: {"organisations":[{"name":string,"url":string,"archetype":string,"type":"direct"|"adjacent","why":string}]}

ARCHETYPES (use the key):
${ARCHETYPE_BRIEF}

RULES:
- Only organisations that plausibly work on the described problem. Include coalitions, alliances, networks, funds, programmes, research institutes and commercial firms.
- EXCLUDE news publishers, directories, listicles, job boards, conference sites, social networks, and the business itself.
- "url" MUST be the organisation's own site taken from a result URL. Never invent a URL.
- "name" is the organisation's proper name, not a page title.
- "why" is one sentence, max 20 words.
- Max 16 organisations. Prefer the most substantial and relevant.`;

const OWN_SITE_SYSTEM = `You read a company's own website and list the OTHER organisations it names or links to.

Return ONLY JSON: {"organisations":[{"name":string,"domain":string|null,"why":string,"type":"direct"|"adjacent"}]}

RULES:
- Include partners, alliance members, coalitions, funders, city networks, research institutes, named alternatives and comparison targets that are named or linked on these pages.
- EXCLUDE only the site owner itself, social networks, analytics/CDN/hosting vendors, website builders, generic software tools and news publishers.
- Non-commercial bodies (alliances, coalitions, institutes, networks, programmes) ARE in scope — do not exclude them.
- "domain" is the apex domain if it appears in the page content or link, otherwise null. Never invent one.
- "type": "direct" if they appear to do the same work, otherwise "adjacent".
- "why" is one short sentence, max 20 words, saying where they appeared and why they matter.
- Max 12 organisations. Return an empty array if none qualify.`;

const SOCIAL = /linkedin\.com|facebook\.com|instagram\.com|x\.com|twitter\.com|youtube\.com|vimeo\.com|tiktok\.com|google\.com|gstatic|cloudflare|wordpress\.|wix\.|squarespace\.|hubspot\.|mailchimp|calendly|eventbrite|apple\.com|microsoft\.com/i;
const NOISE_DOMAIN = /wikipedia\.org|crunchbase\.com|bloomberg\.com|zoominfo\.com|glassdoor\.|indeed\.|medium\.com|substack\.com|reddit\.com|quora\.com|slideshare|scribd|researchgate|sciencedirect|springer|jstor|theguardian|nytimes|bbc\.co|abc\.net\.au|afr\.com|smh\.com\.au|forbes\.com|reuters\.com|prnewswire|businesswire/i;
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

function asArchetype(value: unknown): Archetype | null {
  return typeof value === "string" && ARCHETYPE_KEYS.includes(value) ? (value as Archetype) : null;
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
        const field = [expectation.what_they_do, expectation.sector].filter(Boolean).join(" — ").slice(0, 300);

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
        let ownApex = "";
        if (ownSite) {
          ownApex = apexDomain(ownSite);
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
            const orgs: any[] = Array.isArray(parsedOwn?.organisations) ? parsedOwn.organisations.slice(0, 12) : [];
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

        // ---------- Pass 2: live web search, per archetype ----------
        let searchFound = 0;
        try {
          const plan = await aiJson(QUERY_SYSTEM, {
            field_of_work: field,
            geography: expectation.markets || "Australia",
            project_name: context.project_name,
            problems: (context.problems_worth_solving || []).slice(0, 4),
          });
          const planned: { archetype: Archetype; scope: string; query: string }[] = (Array.isArray(plan?.queries) ? plan.queries : [])
            .map((q: any) => ({
              archetype: asArchetype(q?.archetype) || "other",
              scope: q?.scope === "global" ? "global" : "local",
              query: typeof q?.query === "string" ? q.query.trim() : "",
            }))
            .filter((q: any) => q.query.length > 5);
          // Australia (local) first so local players rank ahead of global bodies.
          planned.sort((a, b) => (a.scope === b.scope ? 0 : a.scope === "local" ? -1 : 1));
          const queries = planned.slice(0, 10);

          const hits: { archetype: Archetype; title: string; url: string; description: string }[] = [];
          for (let i = 0; i < queries.length; i += 5) {
            const batch = queries.slice(i, i + 5);
            const results = await Promise.all(batch.map(async (q) => ({ q, hits: await fcSearch(q.query, 6) })));
            for (const r of results) {
              for (const h of r.hits) {
                const apex = apexDomain(h.url);
                if (!apex || apex === ownApex || SOCIAL.test(apex) || NOISE_DOMAIN.test(apex)) continue;
                hits.push({ archetype: r.q.archetype, title: h.title, url: h.url, description: h.description });
              }
            }
          }

          if (hits.length > 0) {
            const parsed = await aiJson(EXTRACT_SYSTEM, {
              field_of_work: field,
              geography: expectation.markets || "",
              us: { name: context.project_name, domain: ownApex || null },
              results: hits.slice(0, 60),
            });
            const found: any[] = Array.isArray(parsed?.organisations) ? parsed.organisations.slice(0, 16) : [];

            const fresh = found.filter((o) => {
              const name = typeof o?.name === "string" ? o.name.trim() : "";
              const apex = typeof o?.url === "string" ? apexDomain(o.url) : "";
              if (!name || !apex) return false;
              if (takenNames.has(name.toLowerCase()) || takenDomains.has(apex)) return false;
              if (apex === ownApex || SOCIAL.test(apex) || NOISE_DOMAIN.test(apex)) return false;
              takenNames.add(name.toLowerCase());
              takenDomains.add(apex);
              return true;
            });

            for (let i = 0; i < fresh.length; i += 4) {
              const batch = fresh.slice(i, i + 4);
              const checked = await Promise.all(batch.map(async (o) => {
                const name = (o.name as string).trim();
                try {
                  const site = await verifySiteIdentity(name, o.url, expectation);
                  return { o, name, site };
                } catch (e: any) {
                  console.error("[competitor-discover] verify failed", name, e?.message);
                  return { o, name, site: null };
                }
              }));
              const rows = checked
                .filter((c) => c.site?.verdict !== "mismatch")
                .map((c) => {
                  const apex = apexDomain(c.o.url);
                  return {
                    project_id,
                    name: c.name,
                    domain: c.site?.verdict === "match" ? apex : null,
                    type: c.o?.type === "direct" ? "direct" : "adjacent",
                    archetype: asArchetype(c.o?.archetype) || "other",
                    status: "suggested",
                    source: "search",
                    why_suggested: typeof c.o?.why === "string" ? c.o.why.slice(0, 300) : null,
                    identity_verdict: c.site?.verdict || "unsure",
                    identity_reason: c.site?.reason || null,
                    evidence: [{ kind: "search", url: c.o.url, captured_at: now() }],
                    confidence: c.site?.verdict === "match" ? "high" : "medium",
                  };
                });
              searchFound += rows.length;
              await saveRows(rows);
            }
          }
        } catch (e: any) {
          // A failed search pass must not lose the own-site results or block the AI pass.
          console.error("[competitor-discover] search pass failed", e?.message);
        }

        // ---------- Pass 3: AI-proposed set ----------
        const parsed = await aiJson(SYSTEM, { ...context, archetype_keys: ARCHETYPE_KEYS });
        const proposed: any[] = Array.isArray(parsed.competitors) ? parsed.competitors.slice(0, 16) : [];
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
              archetype: asArchetype(r.p?.archetype) || (r.type === "in_house" || r.type === "do_nothing" ? "other" : null),
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

        // ---------- Backfill archetypes, including rows that existed before ----------
        try {
          const { data: unclassified } = await sb
            .from("competitors").select("id, name, domain, type, why_suggested")
            .eq("project_id", project_id).is("archetype", null).limit(100);
          const items = (unclassified || []).map((c: any) => ({
            name: c.name, domain: c.domain, type: c.type, why: c.why_suggested,
          }));
          if (items.length > 0) {
            const map = await classifyArchetypes(items, { field });
            for (const c of unclassified || []) {
              const key = c.type === "in_house" || c.type === "do_nothing"
                ? "other"
                : map[(c.name || "").toLowerCase()];
              if (key) await sb.from("competitors").update({ archetype: key }).eq("id", c.id);
            }
          }
        } catch (e: any) {
          console.error("[competitor-discover] archetype backfill failed", e?.message);
        }

        await sb.from("competitor_runs").update({
          status: "complete",
          saved_count: saved,
          result: {
            proposed: proposed.length, from_own_site: ownSiteFound, from_search: searchFound,
            saved, own_site: ownSite || null,
          },
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
