// Shared helpers for the competitive landscape edge functions.
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY") || "";

export const AI_MODEL = "google/gemini-2.5-flash";

export class AiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Call the Lovable AI Gateway and parse a JSON object response. */
export async function aiJson(system: string, payload: unknown): Promise<any> {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: typeof payload === "string" ? payload : JSON.stringify(payload) },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!r.ok) {
    const text = await r.text();
    console.error("[competitor-ai] gateway error", r.status, text.slice(0, 400));
    if (r.status === 402) throw new AiError(402, "AI credits exhausted — top up credits in Lovable to continue.");
    if (r.status === 403) throw new AiError(403, "AI access is blocked by workspace settings. Ask an admin to re-enable Lovable AI.");
    if (r.status === 429) throw new AiError(429, "AI is rate limited right now. Try again in a minute.");
    throw new AiError(r.status, `AI request failed (${r.status}).`);
  }
  const d = await r.json();
  const content = d?.choices?.[0]?.message?.content || "{}";
  try {
    return JSON.parse(content);
  } catch {
    console.error("[competitor-ai] unparseable content", String(content).slice(0, 300));
    return {};
  }
}

const COMPOUND_TLDS = new Set(["co.uk", "com.au", "co.nz", "co.za", "com.br", "co.in", "co.jp", "com.sg", "com.hk"]);

export function apexDomain(input: string): string {
  let host = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  const parts = host.split(".");
  if (parts.length <= 2) return parts.join(".");
  const last2 = parts.slice(-2).join(".");
  const last3 = parts.slice(-3).join(".");
  return COMPOUND_TLDS.has(last2) ? last3 : last2;
}

export interface FcHit { title: string; url: string; description: string }

export async function fcSearch(query: string, limit = 6): Promise<FcHit[]> {
  if (!FIRECRAWL_API_KEY) return [];
  try {
    const r = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit }),
    });
    const d = await r.json().catch(() => ({}));
    let hits: any[] = [];
    if (Array.isArray(d?.data)) hits = d.data;
    else if (Array.isArray(d?.data?.web)) hits = d.data.web;
    else if (Array.isArray(d?.web?.results)) hits = d.web.results;
    else if (Array.isArray(d?.results)) hits = d.results;
    return hits
      .map((h) => ({
        title: h.title || h.name || "",
        url: h.url || h.link || h.sourceURL || "",
        description: h.description || h.snippet || "",
      }))
      .filter((h) => h.url);
  } catch (e: any) {
    console.error("[competitor-ai] fcSearch failed", e?.message);
    return [];
  }
}

export async function fcScrape(url: string, maxChars = 6000): Promise<string> {
  if (!FIRECRAWL_API_KEY) return "";
  try {
    const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, waitFor: 1200 }),
    });
    const d = await r.json().catch(() => ({}));
    const md = d?.markdown || d?.data?.markdown || "";
    return typeof md === "string" ? md.slice(0, maxChars) : "";
  } catch (e: any) {
    console.error("[competitor-ai] fcScrape failed", url, e?.message);
    return "";
  }
}

/** Discover urls on a site (Firecrawl map), optionally filtered by keyword. */
export async function fcMap(url: string, search?: string, limit = 40): Promise<string[]> {
  if (!FIRECRAWL_API_KEY) return [];
  try {
    const r = await fetch("https://api.firecrawl.dev/v2/map", {
      method: "POST",
      headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, search, limit }),
    });
    const d = await r.json().catch(() => ({}));
    const links = d?.links || d?.data?.links || [];
    return (Array.isArray(links) ? links : [])
      .map((l: any) => (typeof l === "string" ? l : l?.url))
      .filter((u: any) => typeof u === "string");
  } catch (e: any) {
    console.error("[competitor-ai] fcMap failed", e?.message);
    return [];
  }
}

const IDENTITY_SYSTEM = `You verify whether a website belongs to the company a research brief is looking for.

Return ONLY JSON: {"verdict":"match"|"unsure"|"mismatch","reason":string,"sector_seen":string}

RULES:
- "match" only when the site's own content shows the same company name AND the expected sector/services.
- "mismatch" when the site is a different business that happens to share the name (a different industry, a consumer product, a directory, a news article).
- "unsure" when the content is too thin to tell.
- "reason" is one plain sentence, max 25 words, naming what the site actually appears to be.
- "sector_seen" is the sector the site content describes, in a few words.`;

export interface SiteResolution {
  domain: string | null;
  verdict: "match" | "unsure" | "mismatch";
  reason: string;
  markdown: string;
  url: string | null;
}

/** Search for a company's real website and verify the sector before accepting it. */
export async function resolveCompanySite(
  name: string,
  expectation: { sector?: string; markets?: string; what_they_do?: string },
  opts: { preferDomain?: string | null; maxCandidates?: number } = {},
): Promise<{ site: SiteResolution; linkedin: string | null }> {
  const maxCandidates = opts.maxCandidates ?? 3;
  const sector = expectation.sector || expectation.what_they_do || "";
  const markets = expectation.markets || "";
  const queries = [
    `${name} ${sector} ${markets}`.replace(/\s+/g, " ").trim(),
    `${name} official website ${sector}`.replace(/\s+/g, " ").trim(),
  ];

  const seen = new Set<string>();
  const candidates: { apex: string; url: string; title: string; description: string }[] = [];
  let linkedin: string | null = null;

  for (const q of queries) {
    const hits = await fcSearch(q, 6);
    for (const h of hits) {
      const apex = apexDomain(h.url);
      if (!apex) continue;
      if (apex === "linkedin.com") {
        if (!linkedin && /\/company\//i.test(h.url)) linkedin = h.url.split("?")[0];
        continue;
      }
      if (/wikipedia\.org|facebook\.com|instagram\.com|x\.com|twitter\.com|youtube\.com|crunchbase\.com|bloomberg\.com|zoominfo\.com|glassdoor\./.test(apex)) continue;
      if (seen.has(apex)) continue;
      seen.add(apex);
      candidates.push({ apex, url: h.url, title: h.title, description: h.description });
    }
    if (candidates.length >= maxCandidates) break;
  }

  if (opts.preferDomain) {
    const pref = apexDomain(opts.preferDomain);
    candidates.sort((a, b) => (a.apex === pref ? -1 : b.apex === pref ? 1 : 0));
  }

  let best: SiteResolution = { domain: null, verdict: "mismatch", reason: `No website could be found for "${name}".`, markdown: "", url: null };

  for (const c of candidates.slice(0, maxCandidates)) {
    const url = `https://${c.apex}`;
    const md = await fcScrape(url, 5000);
    if (md.length < 120) {
      if (best.verdict === "mismatch" && !best.domain) {
        best = { domain: null, verdict: "unsure", reason: `${c.apex} could not be read.`, markdown: "", url };
      }
      continue;
    }
    let verdict: SiteResolution["verdict"] = "unsure";
    let reason = "";
    try {
      const parsed = await aiJson(IDENTITY_SYSTEM, {
        looking_for: { name, expected_sector: sector, expected_markets: markets, what_they_do: expectation.what_they_do || "" },
        site: { url, title: c.title, content: md.slice(0, 4000) },
      });
      if (["match", "unsure", "mismatch"].includes(parsed?.verdict)) verdict = parsed.verdict;
      reason = typeof parsed?.reason === "string" ? parsed.reason.slice(0, 300) : "";
    } catch (e: any) {
      console.error("[competitor-ai] identity check failed", e?.message);
      reason = "Identity check could not run.";
    }
    if (verdict === "match") {
      return { site: { domain: c.apex, verdict, reason, markdown: md, url }, linkedin };
    }
    if (verdict === "unsure" && best.verdict !== "unsure") {
      best = { domain: null, verdict, reason: reason || `${c.apex} may not be the right company.`, markdown: md, url };
    } else if (verdict === "mismatch" && !best.reason) {
      best = { domain: null, verdict, reason, markdown: "", url };
    } else if (verdict === "mismatch" && best.verdict === "mismatch" && !best.domain) {
      best = { domain: null, verdict, reason: reason || best.reason, markdown: "", url };
    }
  }

  return { site: best, linkedin };
}

/** Short description of the market this project plays in, for identity checks. */
export function marketExpectation(context: any): { sector: string; markets: string; what_they_do: string } {
  const icp = (context?.icps || [])[0] || {};
  const firmo = icp.firmographics || {};
  const sector = [firmo.industry, firmo.sector, icp.segment_name].filter(Boolean).join(", ").slice(0, 200);
  const markets = [firmo.geography, firmo.region, firmo.location].filter(Boolean).join(", ").slice(0, 120);
  const vp = (context?.value_propositions || [])[0] || {};
  const what = (vp.statement || context?.brand_context?.summary || context?.project_name || "").toString().slice(0, 300);
  return { sector, markets, what_they_do: what };
}


/** Build the project context every competitor prompt needs. */
export async function loadProjectContext(sb: any, projectId: string) {
  const [proj, icps, personas, vps, problems] = await Promise.all([
    sb.from("projects").select("name, brand_context, website").eq("id", projectId).maybeSingle(),
    sb.from("icps").select("segment_name, firmographics, psychographics").eq("project_id", projectId).limit(10),
    sb.from("personas").select("persona_name, role_in_buying, pain_points, how_we_help").eq("project_id", projectId).limit(15),
    sb.from("value_propositions").select("statement, fields, segment_label, is_primary").eq("project_id", projectId).limit(6),
    sb.from("value_prop_problems").select("problem, worth_solving_score").eq("project_id", projectId).order("worth_solving_score", { ascending: false }).limit(10),
  ]);
  return {
    project_name: proj.data?.name || "",
    brand_context: proj.data?.brand_context || null,
    website: proj.data?.website || null,
    icps: icps.data || [],
    personas: personas.data || [],
    value_propositions: vps.data || [],
    problems_worth_solving: problems.data || [],
  };
}
