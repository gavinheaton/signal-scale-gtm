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

/** Build the project context every competitor prompt needs. */
export async function loadProjectContext(sb: any, projectId: string) {
  const [proj, icps, personas, vps, problems] = await Promise.all([
    sb.from("projects").select("name, brand_context").eq("id", projectId).maybeSingle(),
    sb.from("icps").select("segment_name, firmographics, psychographics").eq("project_id", projectId).limit(10),
    sb.from("personas").select("persona_name, role_in_buying, pain_points, how_we_help").eq("project_id", projectId).limit(15),
    sb.from("value_propositions").select("statement, fields, segment_label, is_primary").eq("project_id", projectId).limit(6),
    sb.from("value_prop_problems").select("problem, worth_solving_score").eq("project_id", projectId).order("worth_solving_score", { ascending: false }).limit(10),
  ]);
  return {
    project_name: proj.data?.name || "",
    brand_context: proj.data?.brand_context || null,
    icps: icps.data || [],
    personas: personas.data || [],
    value_propositions: vps.data || [],
    problems_worth_solving: problems.data || [],
  };
}
