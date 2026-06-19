// Find organisations matching a discovery campaign's ICP + signals.
// Two-stage: (1) Firecrawl search, (2) scrape article-like results to extract
// real company names + named leadership, then AI-score the merged candidate set.
import { corsHeaders } from "../_shared/cors.ts";
import { requireUser, serviceClient, assertProjectAccess } from "../_shared/auth.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY")!;

interface Body { campaign_id: string }

// Pure social/video noise — drop entirely.
const HARD_BLOCK_HOSTS = new Set([
  "instagram.com", "facebook.com", "tiktok.com", "youtube.com", "youtu.be",
  "twitter.com", "x.com", "pinterest.com", "vimeo.com", "spotify.com", "soundcloud.com",
]);
const HARD_BLOCK_PATHS = ["/reel/", "/reels/", "/shorts/", "/watch", "/status/"];

// Hosts that are usually article/listicle sources — keep, scrape in stage 2.
const ARTICLE_HOSTS = new Set([
  "medium.com", "substack.com", "linkedin.com", "reddit.com", "quora.com",
  "forbes.com", "techcrunch.com", "businessinsider.com", "afr.com", "smh.com.au",
  "theaustralian.com.au", "startupdaily.net", "fintechmagazine.com", "fintechnews.com.au",
  "crunchbase.com", "owler.com", "pitchbook.com", "g2.com", "capterra.com",
  "builtin.com", "wikipedia.org", "businesswire.com", "prnewswire.com",
]);
const ARTICLE_PATH_HINTS = [
  "/best-", "/top-", "/top_", "/list", "/companies/", "/startup", "/founders",
  "/leaders", "/post/", "/posts/", "/article/", "/blog/", "/news/", "/202",
];

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

    const allSignals: string[] = Array.isArray(campaign.qualifying_signals) ? campaign.qualifying_signals : [];
    const firmographic = allSignals.filter(isFirmographic).slice(0, 3);
    const segment = (campaign.target_segment || "").trim();
    const baseSegment = segment || firmographic.join(" ");
    const variants = Array.from(new Set([
      [baseSegment, ...firmographic, "companies"].filter(Boolean).join(" "),
      [baseSegment, "companies list directory"].filter(Boolean).join(" "),
      firmographic[0] ? [baseSegment, firmographic[0], "founders leadership"].filter(Boolean).join(" ") : "",
    ].filter(Boolean))).slice(0, 3).map((s) => s.slice(0, 140));

    console.log("[find-orgs] campaign:", campaign_id, "variants:", variants);

    // ---- Stage 1: search ----
    const searches = await Promise.all(variants.map(async (q) => {
      try {
        const r = await fetch("https://api.firecrawl.dev/v2/search", {
          method: "POST",
          headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query: q, limit: 10 }),
        });
        const txt = await r.text();
        let d: any = {}; try { d = JSON.parse(txt); } catch {}
        let h: any[] = [];
        if (Array.isArray(d?.data)) h = d.data;
        else if (Array.isArray(d?.data?.web)) h = d.data.web;
        else if (Array.isArray(d?.web?.results)) h = d.web.results;
        else if (Array.isArray(d?.web)) h = d.web;
        else if (Array.isArray(d?.results)) h = d.results;
        return { q, status: r.status, hits: h };
      } catch (e: any) {
        console.error("[find-orgs] search error", q, e?.message);
        return { q, status: 0, hits: [] };
      }
    }));
    const rawHits: any[] = searches.flatMap((s) => s.hits);

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

      if (HARD_BLOCK_HOSTS.has(apex)) { dropped.push({ title, reason: `blocked-host:${apex}` }); continue; }
      if (HARD_BLOCK_PATHS.some((p) => path.includes(p))) { dropped.push({ title, reason: "blocked-path" }); continue; }

      const key = apex + path;
      if (seen.has(key)) continue;
      seen.add(key);

      const hit: Hit = { title, url, description, apex, host, path };
      const isLinkedinCompany = host.endsWith("linkedin.com") && (path.startsWith("/company/") || path.startsWith("/school/"));
      const isArticleHost = ARTICLE_HOSTS.has(apex) && !isLinkedinCompany;
      const looksLikeArticle = isArticleHost || ARTICLE_PATH_HINTS.some((p) => path.includes(p));

      if (isLinkedinCompany) directCandidates.push(hit);
      else if (looksLikeArticle) articleSources.push(hit);
      else directCandidates.push(hit);
    }

    console.log("[find-orgs] direct:", directCandidates.length, "articles:", articleSources.length, "dropped:", dropped.length);

    // ---- Stage 2: scrape up to 8 article sources, with retry + outcome capture ----
    const toScrape = articleSources.slice(0, 8);
    type ScrapeOutcome = { url: string; title: string; http_status: number; markdown_length: number; kept: boolean; attempts: number; error?: string };
    const scrapeOnce = async (url: string, onlyMain: boolean) => {
      const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
        method: "POST",
        headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: onlyMain, waitFor: 1500 }),
      });
      const txt = await r.text();
      let d: any = {}; try { d = JSON.parse(txt); } catch {}
      const md = d?.markdown || d?.data?.markdown || "";
      if (!r.ok) console.error("[find-orgs] scrape non-2xx", r.status, url, txt.slice(0, 300));
      return { status: r.status, md: typeof md === "string" ? md : "" };
    };
    const scrapeResults = await Promise.all(toScrape.map(async (a): Promise<{ outcome: ScrapeOutcome; markdown: string }> => {
      try {
        let attempts = 1;
        let { status, md } = await scrapeOnce(a.url, true);
        if (md.length <= 200) { attempts = 2; const retry = await scrapeOnce(a.url, false); status = retry.status || status; md = retry.md || md; }
        const truncated = md.slice(0, 6000);
        const kept = truncated.length > 200;
        return { outcome: { url: a.url, title: a.title, http_status: status, markdown_length: md.length, kept, attempts }, markdown: kept ? truncated : "" };
      } catch (e: any) {
        console.error("[find-orgs] scrape error", a.url, e?.message);
        return { outcome: { url: a.url, title: a.title, http_status: 0, markdown_length: 0, kept: false, attempts: 1, error: e?.message || "fetch failed" }, markdown: "" };
      }
    }));
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
- Only include organisations that plausibly fit the supplied target_segment + qualifying_signals.
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

    if (merged.length === 0) {
      return json({
        candidates: [],
        debug: {
          query_variants: variants,
          raw_hit_count: rawHits.length,
          direct_hits: directCandidates.length,
          articles_scraped: scrapedArticles.length,
          extracted_from_articles: extracted.length,
          sample_dropped: dropped.slice(0, 5),
        },
      });
    }

    // ---- Stage 3: AI scoring against ICP ----
    const ai2 = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: `You score organisations against an Ideal Customer Profile.
Return ONLY JSON: {"candidates":[{"name":string,"domain":string,"suggested_tier":string,"matched_signals":string[],"rationale":string,"source_url":string,"leadership":[{"name":string,"role":string|null}]}],"note":string}

RULES:
- Preserve names and domains from the input candidates verbatim. Do not invent new orgs.
- Preserve the "leadership" array unchanged for each candidate you include.
- "matched_signals" is a subset of qualifying_signals. "suggested_tier" must be one of the provided tier labels.
- Skip orgs clearly matching a disqualifying_signal.
- If none fit, return {"candidates": [], "note": "<reason>"}.` },
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
      return json({ error: `AI scoring failed: ${ai2.status}` }, 502);
    }
    const aiData = await ai2.json();
    const text = aiData?.choices?.[0]?.message?.content as string;
    let parsed: any = {};
    try { parsed = JSON.parse(text); } catch { /* fallback */ }
    const raw = Array.isArray(parsed.candidates) ? parsed.candidates : [];

    const nameSet = new Set(merged.map((m) => m.name.toLowerCase()));
    const validated = raw
      .filter((c: any) => c && typeof c.name === "string" && c.name.trim() && nameSet.has(c.name.toLowerCase()))
      .map((c: any) => ({
        name: c.name.trim(),
        domain: typeof c.domain === "string" ? c.domain.trim() : "",
        suggested_tier: c.suggested_tier || "",
        matched_signals: Array.isArray(c.matched_signals) ? c.matched_signals : [],
        rationale: c.rationale || "",
        source_url: c.source_url || "",
        leadership: Array.isArray(c.leadership) ? c.leadership : [],
      }));

    return json({
      candidates: validated,
      ...(validated.length === 0 ? {
        debug: {
          query_variants: variants,
          raw_hit_count: rawHits.length,
          direct_hits: directCandidates.length,
          articles_scraped: scrapedArticles.length,
          extracted_from_articles: extracted.length,
          merged_candidates: merged.length,
          ai_returned: raw.length,
          ai_note: parsed.note || null,
          sample_dropped: dropped.slice(0, 5),
        },
      } : {
        stats: {
          articles_scraped: scrapedArticles.length,
          extracted_from_articles: extracted.length,
          direct_hits: directCandidates.length,
        },
      }),
    });
  } catch (e: any) {
    console.error(e);
    return json({ error: e?.message || "Internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
