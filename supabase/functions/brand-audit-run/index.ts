import { corsHeaders } from "../_shared/cors.ts";
import { requireUser, serviceClient, assertProjectAccess } from "../_shared/auth.ts";

const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const FIRECRAWL_V2 = "https://api.firecrawl.dev/v2";

interface ScoreResult {
  voice_score: number;
  icp_score: number;
  persona_score: number;
  clarity_score: number;
  voice_reasoning: string;
  icp_reasoning: string;
  persona_reasoning: string;
  clarity_reasoning: string;
  matched_personas: string[];
  matched_icps: string[];
  suggested_rewrite: string;
  page_status: "on_brand" | "drifting" | "off_brand";
}

const SCORE_TOOL = {
  type: "function",
  function: {
    name: "submit_page_score",
    description: "Submit the brand audit scoring for a page",
    parameters: {
      type: "object",
      properties: {
        voice_score: { type: "integer", minimum: 0, maximum: 100 },
        icp_score: { type: "integer", minimum: 0, maximum: 100 },
        persona_score: { type: "integer", minimum: 0, maximum: 100 },
        clarity_score: { type: "integer", minimum: 0, maximum: 100 },
        voice_reasoning: { type: "string" },
        icp_reasoning: { type: "string" },
        persona_reasoning: { type: "string" },
        clarity_reasoning: { type: "string" },
        matched_personas: { type: "array", items: { type: "string" }, description: "IDs of personas this content fits" },
        matched_icps: { type: "array", items: { type: "string" }, description: "IDs of ICPs this content fits" },
        suggested_rewrite: { type: "string", description: "A concrete rewrite of the page's headline + opening paragraph that better matches brand voice and serves the primary ICP/persona." },
        page_status: { type: "string", enum: ["on_brand", "drifting", "off_brand"] },
      },
      required: [
        "voice_score", "icp_score", "persona_score", "clarity_score",
        "voice_reasoning", "icp_reasoning", "persona_reasoning", "clarity_reasoning",
        "matched_personas", "matched_icps", "suggested_rewrite", "page_status",
      ],
    },
  },
};

async function firecrawlMap(url: string, limit: number, search?: string): Promise<string[]> {
  const body: any = { url, limit, includeSubdomains: false };
  if (search) body.search = search;
  const res = await fetch(`${FIRECRAWL_V2}/map`, {
    method: "POST",
    headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("Firecrawl map failed:", data);
    return [];
  }
  const links: string[] = data.links ?? data.data?.links ?? [];
  return links.map((l: any) => typeof l === "string" ? l : l.url).filter(Boolean);
}

async function firecrawlScrape(url: string): Promise<{ markdown: string; title: string }> {
  const res = await fetch(`${FIRECRAWL_V2}/scrape`, {
    method: "POST",
    headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  const d = data.data ?? data;
  return { markdown: d.markdown ?? "", title: d.metadata?.title ?? url };
}

async function scorePage(args: {
  url: string;
  title: string;
  markdown: string;
  brandVoice: any;
  icps: any[];
  personas: any[];
}): Promise<ScoreResult> {
  const { url, title, markdown, brandVoice, icps, personas } = args;
  const excerpt = markdown.slice(0, 8000);

  const systemPrompt = `You are a senior brand strategist auditing a company website page against an established Brand Voice, ICPs, and Personas. Score each dimension 0-100 (100 = perfect alignment, 0 = totally off). Be specific in your reasoning — cite phrases from the page. The "page_status" rule: >=80 = on_brand, 60-79 = drifting, <60 = off_brand. Use the headline weighting: Voice 30%, ICP 30%, Persona 25%, Clarity 15%. Always provide a concrete suggested_rewrite of the headline + opening paragraph.`;

  const context = `
# BRAND VOICE
Personality adjectives: ${(brandVoice?.personality_adjectives ?? []).join(", ") || "(none defined)"}
Tone: ${brandVoice?.tone_description ?? "(none)"}
Brand identity: ${JSON.stringify(brandVoice?.brand_identity ?? {}).slice(0, 1500)}

# ICPs
${icps.map(i => `- [${i.id}] ${i.segment_name} (fit ${i.fit_score}, access ${i.access_score}, category ${i.matrix_category})\n  Firmographics: ${JSON.stringify(i.firmographics).slice(0,400)}\n  Pain signals: ${JSON.stringify(i.psychographics).slice(0,400)}`).join("\n") || "(none)"}

# PERSONAS
${personas.map(p => `- [${p.id}] ${p.persona_name} (${p.role_in_buying})\n  Goals: ${JSON.stringify(p.goals).slice(0,300)}\n  Pains: ${JSON.stringify(p.pain_points).slice(0,300)}\n  How we help: ${p.how_we_help ?? ""}`).join("\n") || "(none)"}

# PAGE TO SCORE
URL: ${url}
Title: ${title}
Content (markdown, truncated):
${excerpt}
`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: context },
      ],
      tools: [SCORE_TOOL],
      tool_choice: { type: "function", function: { name: "submit_page_score" } },
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`AI scoring failed (${res.status}): ${txt.slice(0,300)}`);
  }
  const data = await res.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error("AI did not return a scoring tool call");
  const parsed = JSON.parse(toolCall.function.arguments);
  return parsed as ScoreResult;
}

function weightedHeadline(s: { voice_score: number; icp_score: number; persona_score: number; clarity_score: number }) {
  return Math.round(s.voice_score * 0.30 + s.icp_score * 0.30 + s.persona_score * 0.25 + s.clarity_score * 0.15);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { user } = await requireUser(req, corsHeaders);
    const body = await req.json();
    const { project_id, scope = "quick", base_url, custom_urls = [], page_limit } = body ?? {};
    if (!project_id) throw new Error("project_id required");

    const service = serviceClient();
    await assertProjectAccess(service, user.id, project_id);

    // Load brand context
    const [{ data: bv }, { data: icps }, { data: personas }] = await Promise.all([
      service.from("brand_voices").select("*").eq("project_id", project_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      service.from("icps").select("*").eq("project_id", project_id),
      service.from("personas").select("*").eq("project_id", project_id),
    ]);

    if (!bv || bv.status !== "complete") {
      return new Response(JSON.stringify({ error: "Brand voice must be completed before running an audit." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine page list
    const effectiveLimit = Math.min(Math.max(page_limit ?? (scope === "deep" ? 25 : scope === "quick" ? 8 : 10), 1), 50);
    let urls: string[] = [];
    if (scope === "custom") {
      urls = (custom_urls as string[]).filter(Boolean).slice(0, effectiveLimit);
    } else {
      if (!base_url) throw new Error("base_url required");
      const mapped = await firecrawlMap(base_url, scope === "deep" ? 200 : 30);
      const baseNorm = base_url.replace(/\/$/, "");
      // Exclude non-content pages (sitemaps, feeds, docs/api references, assets, auth, admin, archives, legal, etc.)
      const EXCLUDE_RE = /(\/sitemap[^/]*\.xml|\/sitemap[^/]*\/|\/robots\.txt|\/rss|\/feed(\/|$|\.xml)|\.xml($|\?)|\.json($|\?)|\.txt($|\?)|\.pdf($|\?)|\.zip($|\?)|\.csv($|\?)|\.ics($|\?)|\.(png|jpe?g|gif|svg|webp|ico|mp4|mp3|webm|woff2?|ttf|eot|css|js|map)($|\?)|\/api\/|\/api($|\?)|\/wp-json|\/wp-admin|\/wp-login|\/wp-content\/|\/cdn-cgi\/|\/_next\/|\/static\/|\/assets\/|\/admin(\/|$)|\/login(\/|$)|\/signin(\/|$)|\/signup(\/|$)|\/register(\/|$)|\/logout(\/|$)|\/account(\/|$)|\/cart(\/|$)|\/checkout(\/|$)|\/search(\/|$|\?)|\/tag\/|\/tags\/|\/category\/|\/categories\/|\/author\/|\/page\/\d+|\/docs?(\/|$)|\/documentation(\/|$)|\/developers?(\/|$)|\/reference(\/|$)|\/api-docs|\/swagger|\/openapi|\/graphql|\/changelog|\/release-notes|\/status(\/|$)|\/help(\/|$)|\/support(\/|$)|\/kb(\/|$)|\/knowledge-base|\/privacy|\/terms|\/cookie|\/legal|\/dmca|\/disclaimer|\/404|\/500)/i;
      // Whitelist of key marketing/content page patterns
      const KEY_PAGE_RE = /\/(about|about-us|company|team|mission|story|services?|solutions?|products?|platform|features?|use-cases?|industries|pricing|plans|contact|customers?|case-stud(y|ies)|clients|testimonials|partners?|why-[a-z-]+|how-it-works|approach|methodology|capabilities|offerings?)(\/|$)/i;
      const BLOG_RE = /\/(blog|insights?|articles?|news|resources?|stories|perspectives?|thinking|journal|posts?)(\/|$)/i;
      const contentUrls = mapped.filter(u => !EXCLUDE_RE.test(u));
      const isHome = (u: string) => u.replace(/\/$/, "") === baseNorm;
      // Priority order: home → key marketing pages → blog/insights → other content
      const homeUrl = contentUrls.filter(isHome);
      const keyPages = contentUrls.filter(u => !isHome(u) && KEY_PAGE_RE.test(u));
      const blogPages = contentUrls.filter(u => !isHome(u) && !KEY_PAGE_RE.test(u) && BLOG_RE.test(u));
      const rest = contentUrls.filter(u => !isHome(u) && !KEY_PAGE_RE.test(u) && !BLOG_RE.test(u));
      urls = [...homeUrl, ...keyPages, ...blogPages, ...rest].slice(0, effectiveLimit);
    }

    // Create run
    const { data: run, error: runErr } = await service.from("brand_audit_runs").insert({
      project_id, scope, status: "running",
      base_url: base_url ?? (custom_urls[0] ?? ""),
      custom_urls: scope === "custom" ? custom_urls : null,
      page_limit: effectiveLimit,
      pages_total: urls.length,
      triggered_by: user.id,
      started_at: new Date().toISOString(),
    }).select().single();
    if (runErr) throw runErr;

    // Process in parallel batches of 4
    const BATCH = 4;
    let scored = 0;
    const pageScores: number[] = [];
    const voiceScores: number[] = [];
    const icpScores: number[] = [];
    const personaScores: number[] = [];
    const clarityScores: number[] = [];

    for (let i = 0; i < urls.length; i += BATCH) {
      const batch = urls.slice(i, i + BATCH);
      const results = await Promise.allSettled(batch.map(async (url) => {
        try {
          const { markdown, title } = await firecrawlScrape(url);
          if (!markdown || markdown.length < 50) {
            return { url, title, error: "Page returned no content" };
          }
          const score = await scorePage({ url, title, markdown, brandVoice: bv, icps: icps ?? [], personas: personas ?? [] });
          const headline = weightedHeadline(score);
          return { url, title, markdown, score, headline };
        } catch (e: any) {
          return { url, error: e.message };
        }
      }));

      const rows = results.map(r => {
        if (r.status !== "fulfilled") return null;
        const v: any = r.value;
        if (v.error) {
          return {
            run_id: run.id, project_id, url: v.url, title: v.title ?? null,
            scrape_error: v.error,
          };
        }
        const s = v.score as ScoreResult;
        pageScores.push(v.headline);
        voiceScores.push(s.voice_score);
        icpScores.push(s.icp_score);
        personaScores.push(s.persona_score);
        clarityScores.push(s.clarity_score);
        return {
          run_id: run.id, project_id, url: v.url, title: v.title,
          page_status: s.page_status,
          headline_score: v.headline,
          voice_score: s.voice_score, icp_score: s.icp_score,
          persona_score: s.persona_score, clarity_score: s.clarity_score,
          voice_reasoning: s.voice_reasoning, icp_reasoning: s.icp_reasoning,
          persona_reasoning: s.persona_reasoning, clarity_reasoning: s.clarity_reasoning,
          matched_personas: s.matched_personas?.filter((id: string) => /^[0-9a-f-]{36}$/i.test(id)) ?? [],
          matched_icps: s.matched_icps?.filter((id: string) => /^[0-9a-f-]{36}$/i.test(id)) ?? [],
          suggested_rewrite: s.suggested_rewrite,
          excerpt: (v.markdown as string).slice(0, 600),
          word_count: (v.markdown as string).split(/\s+/).length,
        };
      }).filter(Boolean);

      if (rows.length) {
        await service.from("brand_audit_pages").insert(rows as any);
        scored += rows.filter((r: any) => !r.scrape_error).length;
        await service.from("brand_audit_runs").update({ pages_scored: scored }).eq("id", run.id);
      }
    }

    const avg = (xs: number[]) => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;

    await service.from("brand_audit_runs").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      pages_scored: scored,
      headline_score: avg(pageScores),
      voice_score: avg(voiceScores),
      icp_score: avg(icpScores),
      persona_score: avg(personaScores),
      clarity_score: avg(clarityScores),
    }).eq("id", run.id);

    return new Response(JSON.stringify({ run_id: run.id, pages_scored: scored }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    console.error("brand-audit-run error:", e);
    return new Response(JSON.stringify({ error: e.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
