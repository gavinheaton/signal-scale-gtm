// Find organisations matching a discovery campaign's ICP + signals.
// Two-stage: (1) Firecrawl search, (2) scrape article-like results to extract
// real company names + named leadership, then AI-score the merged candidate set.
import { corsHeaders } from "../_shared/cors.ts";
import { requireUser, serviceClient, assertProjectAccess } from "../_shared/auth.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY")!;

interface Body { campaign_id: string }

// Pure social/video/junk — skip entirely (neither candidate nor article source).
const SKIP_HOSTS = new Set([
  "instagram.com", "facebook.com", "tiktok.com", "youtube.com", "youtu.be",
  "twitter.com", "x.com", "pinterest.com", "vimeo.com", "spotify.com", "soundcloud.com",
]);
const SKIP_PATHS = ["/reel/", "/reels/", "/shorts/", "/watch", "/status/"];

// Directories / aggregators / review sites / job boards / news wires.
// These are NEVER candidate orgs themselves, but their pages CAN be scraped
// in stage 2 to extract the real companies they list.
const DIRECTORY_HOSTS = new Set([
  "crunchbase.com", "owler.com", "pitchbook.com", "similarweb.com",
  "zoominfo.com", "apollo.io", "rocketreach.co", "wikipedia.org",
  "g2.com", "capterra.com", "getapp.com", "softwareadvice.com", "trustpilot.com",
  "clutch.co", "producthunt.com", "angel.co", "wellfound.com", "builtin.com",
  "indeed.com", "seek.com.au", "glassdoor.com", "ziprecruiter.com",
  "businesswire.com", "prnewswire.com", "globenewswire.com",
]);

// Editorial hosts — treat as article sources for stage-2 extraction.
const ARTICLE_HOSTS = new Set([
  "medium.com", "substack.com", "linkedin.com", "reddit.com", "quora.com",
  "forbes.com", "techcrunch.com", "businessinsider.com", "afr.com", "smh.com.au",
  "theaustralian.com.au", "startupdaily.net", "fintechmagazine.com", "fintechnews.com.au",
]);
const ARTICLE_PATH_HINTS = [
  "/best-", "/top-", "/top_", "/list", "/companies/", "/startup", "/founders",
  "/leaders", "/post/", "/posts/", "/article/", "/blog/", "/news/", "/202",
];

// Only trust deep paths on unknown hosts as direct candidates when the path
// looks like a company root — otherwise route to stage-2 scraping.
const ROOT_PATH_HINTS = ["/", "/about", "/about-us", "/company", "/home"];

const COMPOUND_TLDS = new Set([
  "co.uk", "com.au", "co.nz", "co.za", "com.br", "co.in", "co.jp", "com.sg", "com.hk",
]);

function apexDomain(hostname: string): string {
  const parts = hostname.toLowerCase().replace(/^www\./, "").split(".");
  if (parts.length <= 2) return parts.join(".");
  const last2 = parts.slice(-2).join(".");
  const last3 = parts.slice(-3).join(".");
  if (COMPOUND_TLDS.has(last2)) return last3;
  return last2;
}

function cleanTitle(title: string): string {
  return title
    .replace(/\s*[\|\-–—]\s*(LinkedIn|Crunchbase|Twitter|X|Facebook|Instagram|YouTube|Reddit|Medium|Wikipedia|PitchBook|Owler|G2|Capterra|Glassdoor).*$/i, "")
    .replace(/\s+\(\@.+?\)\s*$/i, "")
    .trim();
}

const FIRMOGRAPHIC_REGEX = /(industry|sector|size|employees|revenue|geograph|region|country|australia|asia|europe|emea|apac|amer|uk|usa|united states|canada|nz|new zealand|series\s*[a-d]|pre-?series|seed|ipo|listed|asx|nasdaq|nyse|public|private|enterprise|smb|smbs|mid[- ]market|startup|scaleup|regulated|apra|asic|fca|sec|iso\s*\d|soc\s*2|gdpr|hipaa|b[- ]corp|certified|fortune\s*\d+|\$\d|m\+|b\+|million|billion)/i;
const isFirmographic = (s: string) => FIRMOGRAPHIC_REGEX.test(s);

interface Hit { title: string; url: string; description: string; apex: string; host: string; path: string }
interface ExtractedCandidate {
  name: string;
  domain: string | null;
  source_article_url: string;
  mention_context?: string;
  leadership?: { name: string; role?: string | null }[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    let user;
    try { ({ user } = await requireUser(req, corsHeaders)); }
    catch (r) { return r as Response; }

    const { campaign_id }: Body = await req.json();
    if (!campaign_id) return json({ error: "campaign_id required" }, 400);

    const sb = serviceClient();
    const { data: campaign, error } = await sb.from("discovery_campaigns").select("*").eq("id", campaign_id).maybeSingle();
    if (error || !campaign) return json({ error: "Campaign not found" }, 404);
    try { await assertProjectAccess(sb, user.id, campaign.project_id); }
    catch (e: any) { return json({ error: e?.message || "Forbidden" }, 403); }
    if (!FIRECRAWL_API_KEY) return json({ error: "FIRECRAWL_API_KEY not configured" }, 500);

    // Create the run row up front, answer immediately, then work in the background.
    const { data: run, error: runErr } = await sb
      .from("discovery_search_runs")
      .insert({ campaign_id, status: "running", created_by: user.id })
      .select("id")
      .single();
    if (runErr || !run) return json({ error: runErr?.message || "Could not start search run" }, 500);
    const runId = run.id as string;

    const pipeline = async () => {
    const allSignals: string[] = Array.isArray(campaign.qualifying_signals) ? campaign.qualifying_signals : [];

    const firmographic = allSignals.filter(isFirmographic).slice(0, 3);
    const segment = (campaign.target_segment || "").trim();
    const baseSegment = segment || firmographic.join(" ");

    // Heuristic fallback: short, company-seeking queries (never raw ICP prose).
    const shortSegment = baseSegment.split(/[\n.;:—–]/)[0].trim().slice(0, 70);
    const fallbackVariants = [
      `${shortSegment} directory list of businesses`,
      `${shortSegment} clinics practices companies`,
      `"${shortSegment}" contact us about us`,
    ].filter((s) => s.replace(/["\s]/g, "").length > 8);

    // Ask the AI to write real web-search queries that surface COMPANIES,
    // not industry/market-overview content.
    let variants: string[] = [];
    try {
      const qr = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: `You write web search queries that find NAMED INDIVIDUAL BUSINESSES that match an ideal customer profile.

Return ONLY JSON: {"queries": [string, string, string, string]}

RULES:
- Each query must be a natural search phrase a person would type to find ACTUAL COMPANIES — never market research, industry reports, statistics, government policy, academic papers, or "about the industry" pages.
- Never paste the ICP description verbatim. Extract: what the business DOES, where it is, and its size/type.
- Max 12 words per query. No boolean operators except quotes.
- Mix query shapes: (1) a directory/list query ("... directory", "list of ... in <place>"), (2) a local business query using the industry noun + city/region, (3) a query that lands on company websites (e.g. industry noun + "clinic" / "practice" / "studio" + place), (4) an association/member-list query ("<industry> association member directory <place>").
- Use the concrete industry noun and geography. If geography is a country, also name its 1-2 largest cities in one of the queries.` },
            { role: "user", content: JSON.stringify({
              target_segment: campaign.target_segment,
              description: campaign.description,
              qualifying_signals: allSignals.slice(0, 10),
            }) },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (qr.ok) {
        const d = await qr.json();
        const parsedQ = JSON.parse(d?.choices?.[0]?.message?.content || "{}");
        if (Array.isArray(parsedQ.queries)) {
          variants = parsedQ.queries
            .filter((q: any) => typeof q === "string" && q.trim().length > 5)
            .map((q: string) => q.trim().slice(0, 120));
        }
      } else {
        console.error("[find-orgs] query-gen failed", qr.status);
      }
    } catch (e: any) {
      console.error("[find-orgs] query-gen error", e?.message);
    }
    if (variants.length === 0) variants = fallbackVariants;
    variants = Array.from(new Set(variants)).slice(0, 4);

    console.log("[find-orgs] campaign:", campaign_id, "variants:", variants);


    // ---- Stage 1: search (sequential + backoff — Firecrawl rate-limits bursts) ----
    const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
    const searchOnce = async (q: string) => {
      let last = { q, status: 0, hits: [] as any[] };
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const r = await fetch("https://api.firecrawl.dev/v2/search", {
            method: "POST",
            headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ query: q, limit: 10 }),
          });
          const txt = await r.text();
          if (r.status === 429) { await sleep(2500 * (attempt + 1)); last = { q, status: 429, hits: [] }; continue; }
          let d: any = {}; try { d = JSON.parse(txt); } catch {}
          let h: any[] = [];
          if (Array.isArray(d?.data)) h = d.data;
          else if (Array.isArray(d?.data?.web)) h = d.data.web;
          else if (Array.isArray(d?.web?.results)) h = d.web.results;
          else if (Array.isArray(d?.web)) h = d.web;
          else if (Array.isArray(d?.results)) h = d.results;
          if (!r.ok) console.error("[find-orgs] search non-2xx", r.status, q, txt.slice(0, 200));
          return { q, status: r.status, hits: h };
        } catch (e: any) {
          console.error("[find-orgs] search error", q, e?.message);
          last = { q, status: 0, hits: [] };
        }
      }
      return last;
    };
    // Run the query variants concurrently — per-query 429 backoff still applies.
    const searches: { q: string; status: number; hits: any[] }[] = await Promise.all(variants.map(searchOnce));

    const rawHits: any[] = searches.flatMap((s) => s.hits);
    console.log("[find-orgs] raw hits:", rawHits.length, "per query:", searches.map((s) => `${s.status}:${s.hits.length}`).join(","));


    // ---- Classify hits ----
    const seen = new Set<string>();
    const dropped: { title: string; reason: string }[] = [];
    const directCandidates: Hit[] = [];
    const articleSources: Hit[] = [];

    for (const h of rawHits) {
      const url = h.url || h.link || h.sourceURL || h?.metadata?.sourceURL || "";
      const title = cleanTitle(h.title || h.name || "");
      const description = h.description || h.snippet || h.summary || (typeof h.markdown === "string" ? h.markdown.slice(0, 400) : "");
      if (!url) { dropped.push({ title, reason: "no-url" }); continue; }
      let host = ""; let path = "";
      try { const u = new URL(url); host = u.hostname.toLowerCase().replace(/^www\./, ""); path = u.pathname.toLowerCase(); }
      catch { dropped.push({ title, reason: "bad-url" }); continue; }
      const apex = apexDomain(host);

      if (SKIP_HOSTS.has(apex)) { dropped.push({ title, reason: `blocked-host:${apex}` }); continue; }
      if (SKIP_PATHS.some((p) => path.includes(p))) { dropped.push({ title, reason: "blocked-path" }); continue; }
      // LinkedIn /jobs is a job board — skip entirely.
      if (host.endsWith("linkedin.com") && path.startsWith("/jobs")) { dropped.push({ title, reason: "linkedin-jobs" }); continue; }

      const key = apex + path;
      if (seen.has(key)) continue;
      seen.add(key);

      const hit: Hit = { title, url, description, apex, host, path };
      const isLinkedinCompany = host.endsWith("linkedin.com") && (path.startsWith("/company/") || path.startsWith("/school/"));
      const isDirectory = DIRECTORY_HOSTS.has(apex);
      const isArticleHost = ARTICLE_HOSTS.has(apex) && !isLinkedinCompany;
      const looksLikeArticle = isArticleHost || ARTICLE_PATH_HINTS.some((p) => path.includes(p));
      const isRootish = ROOT_PATH_HINTS.includes(path) || path === "" || /^\/[a-z-]{0,20}\/?$/.test(path);

      if (isDirectory) {
        // Directory pages feed stage-2 extraction only, never candidacy.
        articleSources.push(hit);
      } else if (isLinkedinCompany) {
        directCandidates.push(hit);
      } else if (looksLikeArticle) {
        articleSources.push(hit);
      } else if (isRootish) {
        directCandidates.push(hit);
      } else {
        // Unknown host, deep path — likely an article/listing, route to scrape.
        articleSources.push(hit);
      }
    }

    console.log("[find-orgs] direct:", directCandidates.length, "articles:", articleSources.length, "dropped:", dropped.length);

    // ---- Stage 2: scrape article sources, throttled (concurrency 3) with 429 backoff ----
    const toScrape = articleSources.slice(0, 6);

    type ScrapeOutcome = { url: string; title: string; http_status: number; markdown_length: number; kept: boolean; attempts: number; error?: string };
    const scrapeOnce = async (url: string, onlyMain: boolean) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
          method: "POST",
          headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: onlyMain, waitFor: 1500 }),
        });
        const txt = await r.text();
        if (r.status === 429) { await sleep(3000 * (attempt + 1)); continue; }
        let d: any = {}; try { d = JSON.parse(txt); } catch {}
        const md = d?.markdown || d?.data?.markdown || "";
        if (!r.ok) console.error("[find-orgs] scrape non-2xx", r.status, url, txt.slice(0, 300));
        return { status: r.status, md: typeof md === "string" ? md : "" };
      }
      return { status: 429, md: "" };
    };
    const scrapeOne = async (a: Hit): Promise<{ outcome: ScrapeOutcome; markdown: string }> => {
      try {
        let attempts = 1;
        let { status, md } = await scrapeOnce(a.url, true);
        if (md.length <= 200) { attempts = 2; await sleep(800); const retry = await scrapeOnce(a.url, false); status = retry.status || status; md = retry.md || md; }
        const truncated = md.slice(0, 6000);
        const kept = truncated.length > 200;
        return { outcome: { url: a.url, title: a.title, http_status: status, markdown_length: md.length, kept, attempts }, markdown: kept ? truncated : "" };
      } catch (e: any) {
        console.error("[find-orgs] scrape error", a.url, e?.message);
        return { outcome: { url: a.url, title: a.title, http_status: 0, markdown_length: 0, kept: false, attempts: 1, error: e?.message || "fetch failed" }, markdown: "" };
      }
    };
    const scrapeResults: { outcome: ScrapeOutcome; markdown: string }[] = [];
    for (let i = 0; i < toScrape.length; i += 3) {
      const batch = await Promise.all(toScrape.slice(i, i + 3).map(scrapeOne));
      scrapeResults.push(...batch);
    }


    const scrapeOutcomes = scrapeResults.map((s) => s.outcome);
    const scrapedArticles = scrapeResults
      .filter((s) => s.outcome.kept)
      .map((s) => ({ url: s.outcome.url, title: s.outcome.title, markdown: s.markdown }));
    console.log("[find-orgs] scraped articles:", scrapedArticles.length, "of", toScrape.length);

    // ---- Stage 2 extraction (AI) ----
    let extracted: ExtractedCandidate[] = [];
    if (scrapedArticles.length > 0) {
      const ai = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: `You extract real ORGANISATIONS and their NAMED LEADERS from web article text.

Return ONLY JSON: {"organisations":[{"name":string,"domain":string|null,"source_article_url":string,"mention_context":string,"leadership":[{"name":string,"role":string|null}]}]}

HARD RULES:
- Only include organisations that would BUY or USE the service/product implied by target_segment + qualifying_signals. They are prospective CUSTOMERS.
- EXCLUDE vendors, agencies, consultancies, SaaS tools, marketplaces, directories, aggregators, media outlets, industry bodies, associations, and events — unless target_segment explicitly names them as buyers.
- Skip orgs that clearly match a disqualifying_signal.
- "name" must be a real company name copied verbatim from the article text. Strip legal suffixes (Pty Ltd, Inc., LLC) unless essential.
- "domain" is your best-guess apex (e.g. "stripe.com") if the article cites it; otherwise null. Never invent.
- "leadership" entries MUST be people explicitly named in the article in a leadership role (CEO, Founder, Co-founder, CTO, CFO, COO, MD, President, Chair, VP). NEVER fabricate names. If no leaders named, return [].
- "mention_context" is a <=200 char quote from the article that shows the org being discussed.
- Dedupe within a single article.
- If an article contains no fitting organisations, omit it.` },
            { role: "user", content: JSON.stringify({
              target_segment: campaign.target_segment,
              qualifying_signals: allSignals,
              disqualifying_signals: campaign.disqualifying_signals,
              articles: scrapedArticles,
            }) },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (ai.ok) {
        const data = await ai.json();
        const text = data?.choices?.[0]?.message?.content as string;
        let parsed: any = {};
        try { parsed = JSON.parse(text); } catch { /* ignore */ }
        if (Array.isArray(parsed.organisations)) {
          // Validate leadership names actually appear in the source article markdown
          const articleByUrl = new Map(scrapedArticles.map((a) => [a.url, a.markdown.toLowerCase()]));
          extracted = parsed.organisations
            .filter((o: any) => o && typeof o.name === "string" && o.name.trim())
            .map((o: any) => {
              const src = articleByUrl.get(o.source_article_url) || "";
              const leadership = Array.isArray(o.leadership)
                ? o.leadership.filter((l: any) =>
                    l && typeof l.name === "string" && l.name.trim() && src.includes(l.name.toLowerCase())
                  ).map((l: any) => ({ name: l.name.trim(), role: l.role || null }))
                : [];
              return {
                name: o.name.trim(),
                domain: typeof o.domain === "string" && o.domain.trim() ? o.domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] : null,
                source_article_url: o.source_article_url,
                mention_context: typeof o.mention_context === "string" ? o.mention_context.slice(0, 240) : "",
                leadership,
              } as ExtractedCandidate;
            });
        }
      } else {
        const t = await ai.text();
        console.error("[find-orgs] extraction AI failed", ai.status, t.slice(0, 400));
      }
    }
    console.log("[find-orgs] extracted from articles:", extracted.length);

    // ---- Merge direct + extracted ----
    type Merged = {
      name: string; domain: string | null; source_url: string;
      mention_context?: string; leadership: { name: string; role?: string | null }[];
    };
    const byKey = new Map<string, Merged>();
    const keyOf = (name: string, domain: string | null) => (domain || name).toLowerCase();
    for (const d of directCandidates) {
      const k = keyOf(d.title || d.apex, d.apex);
      if (!byKey.has(k)) byKey.set(k, { name: d.title || d.apex, domain: d.apex, source_url: d.url, leadership: [] });
    }
    for (const e of extracted) {
      const k = keyOf(e.name, e.domain);
      const existing = byKey.get(k);
      if (existing) {
        if (e.leadership && e.leadership.length) existing.leadership = e.leadership;
        if (!existing.mention_context && e.mention_context) existing.mention_context = e.mention_context;
        if (!existing.domain && e.domain) existing.domain = e.domain;
      } else {
        byKey.set(k, { name: e.name, domain: e.domain, source_url: e.source_article_url, mention_context: e.mention_context, leadership: e.leadership || [] });
      }
    }
    const merged = Array.from(byKey.values());
    console.log("[find-orgs] merged candidates:", merged.length);

    const baseDebug = {
      query_variants: variants,
      raw_hit_count: rawHits.length,
      direct_hits: directCandidates.length,
      article_sources: articleSources.length,
      articles_scraped: scrapedArticles.length,
      extracted_from_articles: extracted.length,
      merged_candidates: merged.length,
      scrape_outcomes: scrapeOutcomes,
      sample_dropped: dropped.slice(0, 5),
    };

    if (merged.length === 0) {
      return { candidates: [], debug: baseDebug };
    }


    // ---- Stage 3: AI scoring against ICP (loose: default-include) ----
    const ai2 = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: `You score candidate organisations against an Ideal Customer Profile.

Return ONLY JSON:
{
  "candidates":[{"name":string,"domain":string,"suggested_tier":string,"matched_signals":string[],"rationale":string,"source_url":string,"leadership":[{"name":string,"role":string|null}],"confidence":"high"|"medium"|"low"}],
  "dropped":[{"name":string,"reason":string}],
  "note":string
}

RULES — default to INCLUDE, not exclude:
- Preserve names, domains, source_url and leadership from input candidates verbatim. Do not invent organisations.
- INCLUDE any candidate whose name or domain plausibly fits the target_segment, even if no qualifying_signals are visible in the input. Set "matched_signals": [] in that case.
- Treat qualifying_signals as scoring HINTS, not gates. Lack of evidence is not a reason to drop.
- DROP any candidate that is a vendor/provider of the category the target_segment BUYS (e.g. if target_segment is "companies that need X", drop "X software vendors", "X agencies", "X consultancies", "X platforms", "X marketplaces", directories, review sites, job boards, industry associations, media outlets, event organisers). Candidates must be prospective CUSTOMERS.
- Only put a candidate in "dropped" when it CLEARLY matches a disqualifying_signal, is a provider/directory rather than a buyer, is obviously the wrong industry/geography, or is not a real organisation.
- "confidence": "high" if the name/domain plus signals strongly match the segment; "medium" if it fits the segment but signals are unverified; "low" if it's a plausible guess only.
- "suggested_tier" must be one of the provided tier labels (pick the closest fit; if unsure, pick the first tier).
- For every dropped candidate, give a one-sentence reason.
- Every input candidate must appear in either "candidates" or "dropped".` },
          { role: "user", content: JSON.stringify({
            target_segment: campaign.target_segment,
            qualifying_signals: allSignals,
            disqualifying_signals: campaign.disqualifying_signals,
            tiers: (campaign.tiers || []).map((t: any) => t.label),
            input_candidates: merged,
          }) },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!ai2.ok) {
      const t = await ai2.text();
      console.error("[find-orgs] scoring AI failed", ai2.status, t.slice(0, 400));
      throw Object.assign(new Error(`AI scoring failed: ${ai2.status}`), { debug: baseDebug });
    }
    const aiData = await ai2.json();
    const text = aiData?.choices?.[0]?.message?.content as string;
    let parsed: any = {};
    try { parsed = JSON.parse(text); } catch { /* fallback */ }
    const raw = Array.isArray(parsed.candidates) ? parsed.candidates : [];
    const aiDropped = Array.isArray(parsed.dropped) ? parsed.dropped : [];

    const nameSet = new Set(merged.map((m) => m.name.toLowerCase()));
    const validated = raw
      .filter((c: any) => c && typeof c.name === "string" && c.name.trim() && nameSet.has(c.name.toLowerCase()))
      .map((c: any) => ({
        name: c.name.trim(),
        domain: typeof c.domain === "string" ? c.domain.trim() : "",
        suggested_tier: c.suggested_tier || ((campaign.tiers || [])[0]?.label ?? ""),
        matched_signals: Array.isArray(c.matched_signals) ? c.matched_signals : [],
        rationale: c.rationale || "",
        source_url: c.source_url || "",
        leadership: Array.isArray(c.leadership) ? c.leadership : [],
        confidence: ["high", "medium", "low"].includes(c.confidence) ? c.confidence : "medium",
      }));

      return {
        candidates: validated,
        debug: {
          ...baseDebug,
          ai_returned: raw.length,
          ai_note: parsed.note || null,
          ai_dropped: aiDropped,
        },
      };
    };

    const background = (async () => {
      try {
        const result = await pipeline();
        await sb.from("discovery_search_runs").update({
          status: "complete",
          candidates: result.candidates,
          debug: result.debug,
        }).eq("id", runId);
      } catch (e: any) {
        console.error("[find-orgs] pipeline failed", e?.message);
        await sb.from("discovery_search_runs").update({
          status: "error",
          error: e?.message || "Search failed",
          debug: e?.debug ?? null,
        }).eq("id", runId);
      }
    })();

    // Keep the worker alive after the response is returned.
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
