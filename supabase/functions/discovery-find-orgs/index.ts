// Find organisations matching a discovery campaign's ICP + signals using Firecrawl + Lovable AI.
import { corsHeaders } from "../_shared/cors.ts";
import { requireUser, serviceClient, assertProjectAccess } from "../_shared/auth.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY")!;

interface Body { campaign_id: string }

// Hosts that almost never represent a company we want to target.
const BLOCKED_HOSTS = new Set([
  "instagram.com", "facebook.com", "tiktok.com", "youtube.com", "youtu.be",
  "reddit.com", "twitter.com", "x.com", "medium.com", "substack.com",
  "pinterest.com", "quora.com", "wikipedia.org", "amazon.com", "ebay.com",
  "vimeo.com", "spotify.com", "soundcloud.com",
]);
const BLOCKED_PATH_FRAGMENTS = ["/reel/", "/reels/", "/shorts/", "/watch", "/video/", "/posts/", "/status/"];

// Multi-label TLDs we should keep two labels of (treat as suffix).
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

const FIRMOGRAPHIC_REGEX = /(industry|sector|size|employees|revenue|geograph|region|country|australia|asia|europe|emea|apac|amer|uk|usa|united states|canada|nz|new zealand|series\s*[a-d]|pre-?series|seed|ipo|listed|asx|nasdaq|nyse|public|private|enterprise|smb|smbs|mid[- ]market|startup|scaleup|regulated|apra|asic|fca|sec|iso\s*\d|soc\s*2|gdpr|hipaa|b[- ]corp|certified|fortune\s*\d+|revenue|\$\d|m\+|b\+|million|billion)/i;
function isFirmographic(s: string): boolean { return FIRMOGRAPHIC_REGEX.test(s); }

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

    // Build up to 3 targeted query variants, all weighted toward company sites.
    const baseSegment = segment || firmographic.join(" ");
    const variants = Array.from(new Set([
      [baseSegment, ...firmographic, "companies"].filter(Boolean).join(" "),
      [baseSegment, "companies list directory"].filter(Boolean).join(" "),
      firmographic[0] ? [baseSegment, firmographic[0], "company"].filter(Boolean).join(" ") : "",
    ].filter(Boolean))).slice(0, 3).map((s) => s.slice(0, 140));

    console.log("[find-orgs] campaign:", campaign_id, "variants:", variants);

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
    console.log("[find-orgs] raw hits:", rawHits.length);

    // Normalize + filter
    const seen = new Set<string>();
    const dropped: { title: string; reason: string }[] = [];
    const filtered: { title: string; url: string; description: string; apex: string }[] = [];
    for (const h of rawHits) {
      const url = h.url || h.link || h.sourceURL || h?.metadata?.sourceURL || "";
      const title = cleanTitle(h.title || h.name || "");
      const description = h.description || h.snippet || h.summary || (typeof h.markdown === "string" ? h.markdown.slice(0, 400) : "");
      if (!url) { dropped.push({ title, reason: "no-url" }); continue; }
      let host = ""; let path = "";
      try { const u = new URL(url); host = u.hostname.toLowerCase().replace(/^www\./, ""); path = u.pathname.toLowerCase(); }
      catch { dropped.push({ title, reason: "bad-url" }); continue; }
      const apex = apexDomain(host);
      // LinkedIn company pages are OK; LinkedIn posts/profiles are not.
      if (host.endsWith("linkedin.com")) {
        if (!path.startsWith("/company/") && !path.startsWith("/school/")) {
          dropped.push({ title, reason: "linkedin-non-company" }); continue;
        }
      } else if (BLOCKED_HOSTS.has(apex)) {
        dropped.push({ title, reason: `blocked-host:${apex}` }); continue;
      }
      if (BLOCKED_PATH_FRAGMENTS.some((p) => path.includes(p))) {
        dropped.push({ title, reason: "blocked-path" }); continue;
      }
      const key = apex + (host.endsWith("linkedin.com") ? path : "");
      if (seen.has(key)) continue;
      seen.add(key);
      filtered.push({ title, url, description, apex });
    }
    console.log("[find-orgs] filtered hits:", filtered.length, "dropped:", dropped.length);

    if (filtered.length === 0) {
      return json({
        candidates: [],
        debug: {
          query_variants: variants,
          raw_hit_count: rawHits.length,
          filtered_hit_count: 0,
          sample_dropped: dropped.slice(0, 5),
        },
      });
    }

    const apexSet = new Set(filtered.map((h) => h.apex));

    // Score with AI - strict org extraction
    const ai = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: `You identify real organisations from web search results and score them against an Ideal Customer Profile.

Return ONLY JSON: {"candidates":[{"name":string,"domain":string,"suggested_tier":string,"matched_signals":string[],"rationale":string,"source_url":string}], "note": string}

HARD RULES:
- "name" must be a real company / organisation name (not a person, not a blog post title, not a generic phrase). Strip suffixes like "Pty Ltd", "Inc.", "LLC" unless they are essential to the name.
- "domain" MUST be one of the apex domains in the supplied hits list. Do not invent domains.
- If a hit is clearly NOT a company (a listicle, news article, social post, person's profile), use it as research about a company but do not turn the hit itself into a candidate unless you can identify the underlying company and its domain appears in another hit.
- Merge multiple hits sharing the same apex into one candidate.
- "matched_signals" must be a subset of qualifying_signals. "suggested_tier" must be one of the supplied tier labels.
- Skip any org clearly matching a disqualifying_signal.
- If none of the hits represent identifiable real organisations matching the ICP, return {"candidates": [], "note": "<one-sentence reason>"}.` },
          { role: "user", content: JSON.stringify({
            target_segment: campaign.target_segment,
            qualifying_signals: allSignals,
            disqualifying_signals: campaign.disqualifying_signals,
            tiers: (campaign.tiers || []).map((t: any) => t.label),
            allowed_apex_domains: Array.from(apexSet),
            hits: filtered,
          }) },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!ai.ok) {
      const t = await ai.text();
      console.error("[find-orgs] AI failed", ai.status, t.slice(0, 400));
      return json({ error: `AI scoring failed: ${ai.status}` }, 502);
    }
    const aiData = await ai.json();
    const text = aiData?.choices?.[0]?.message?.content as string;
    let parsed: any = {};
    try { parsed = JSON.parse(text); } catch { /* fallback */ }
    const raw = Array.isArray(parsed.candidates) ? parsed.candidates : [];

    // Server-side validation: name non-empty, domain in apexSet
    const validated = raw.filter((c: any) => {
      if (!c || typeof c.name !== "string" || !c.name.trim()) return false;
      if (typeof c.domain !== "string" || !c.domain.trim()) return false;
      const dApex = apexDomain(c.domain.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]);
      return apexSet.has(dApex);
    });
    const droppedByValidator = raw.length - validated.length;
    if (droppedByValidator > 0) console.log("[find-orgs] dropped by validator:", droppedByValidator);

    return json({
      candidates: validated,
      ...(validated.length === 0 ? {
        debug: {
          query_variants: variants,
          raw_hit_count: rawHits.length,
          filtered_hit_count: filtered.length,
          ai_returned: raw.length,
          ai_note: parsed.note || null,
          sample_dropped: dropped.slice(0, 5),
        },
      } : {}),
    });
  } catch (e: any) {
    console.error(e);
    return json({ error: e?.message || "Internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
