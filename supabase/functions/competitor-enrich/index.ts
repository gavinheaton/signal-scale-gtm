// Research one competitor: validate/find its website, scrape key pages, and
// extract positioning, claims, proof points, pricing signals and weaknesses.
import { corsHeaders } from "../_shared/cors.ts";
import { requireUser, serviceClient, assertProjectAccess } from "../_shared/auth.ts";
import { aiJson, apexDomain, fcSearch, fcScrape, loadProjectContext, AiError } from "../_shared/competitorAi.ts";

interface Body { competitor_id: string }

const SYSTEM = `You profile a competitor from its own website content, for a B2B go-to-market team.

Return ONLY JSON:
{"positioning":string,"target_segments":string[],"claims":string[],"proof_points":[{"text":string,"source_url":string|null}],"pricing_signals":string,"strengths":string[],"weaknesses":string[],"confidence":"high"|"medium"|"low"}

RULES:
- Use ONLY the supplied page content. Never use outside knowledge and never invent a fact.
- "positioning" is how THEY describe themselves, in one sentence, max 30 words.
- "claims" are the specific promises they make in their own words (max 6, short).
- "proof_points" are named customers, numbers, certifications, awards or case studies visible in the content. "source_url" must be one of the supplied page urls. Empty array if none.
- "pricing_signals" is what the content reveals about price or commercial model (empty string if nothing visible).
- "strengths" are advantages evidenced in the content. "weaknesses" are gaps YOU can observe against the supplied project context (silences, narrow scope, missing proof) — max 4 each, one short line each.
- "confidence" reflects how much usable content you were given.
- If content is thin, return fewer items rather than guessing.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    let user;
    try { ({ user } = await requireUser(req, corsHeaders)); }
    catch (r) { return r as Response; }

    const { competitor_id }: Body = await req.json();
    if (!competitor_id) return json({ error: "competitor_id required" }, 400);

    const sb = serviceClient();
    const { data: comp } = await sb.from("competitors").select("*").eq("id", competitor_id).maybeSingle();
    if (!comp) return json({ error: "Competitor not found" }, 404);
    try { await assertProjectAccess(sb, user.id, comp.project_id); }
    catch (e: any) { return json({ error: e?.message || "Forbidden" }, 403); }

    const { data: run, error: runErr } = await sb
      .from("competitor_runs")
      .insert({ project_id: comp.project_id, kind: "enrich", status: "running", target_id: competitor_id, created_by: user.id })
      .select("id").single();
    if (runErr || !run) return json({ error: runErr?.message || "Could not start research" }, 500);
    const runId = run.id as string;

    const background = (async () => {
      try {
        const evidence: any[] = [];
        const now = () => new Date().toISOString();
        const context = await loadProjectContext(sb, comp.project_id);
        const expectation = marketExpectation(context);

        // A domain the user typed in is trusted as-is and never overwritten.
        let domain: string | null = comp.domain ? apexDomain(comp.domain) : null;
        let linkedin: string | null = comp.linkedin_url || null;
        let verdict: string | null = comp.identity_verdict || null;
        let reason: string | null = comp.identity_reason || null;

        if (!domain) {
          const { site, linkedin: li } = await resolveCompanySite(comp.name, expectation);
          verdict = site.verdict;
          reason = site.reason || null;
          if (!linkedin) linkedin = li;
          if (site.verdict === "match" && site.domain) domain = site.domain;
        } else if (comp.domain_locked) {
          verdict = "match";
          reason = "Web address supplied by you.";
        }

        const pages: { url: string; markdown: string }[] = [];
        if (domain) {
          const urls = [
            `https://${domain}`,
            `https://${domain}/about`,
            `https://${domain}/pricing`,
          ];
          for (const u of urls) {
            const md = await fcScrape(u, 5000);
            if (md.length > 150) {
              pages.push({ url: u, markdown: md });
              evidence.push({ kind: "page", url: u, captured_at: now() });
            }
          }
        }
        if (linkedin) evidence.push({ kind: "linkedin", url: linkedin, captured_at: now() });

        if (pages.length === 0) {
          await sb.from("competitors").update({
            domain: comp.domain_locked ? comp.domain : null,
            linkedin_url: linkedin,
            identity_verdict: verdict || "mismatch",
            identity_reason: reason || `Could not read a website for "${comp.name}".`,
            evidence,
          }).eq("id", competitor_id);
          throw new Error(
            (reason ? `${reason} ` : "") +
            `No verified website for "${comp.name}" — add its web address on the profile and research again.`,
          );
        }

        const parsed = await aiJson(SYSTEM, {
          competitor_name: comp.name,
          competitor_type: comp.type,
          project_context: context,
          pages,
        });

        const asStrings = (v: any, max = 8) => (Array.isArray(v) ? v.filter((s) => typeof s === "string" && s.trim()).map((s: string) => s.trim().slice(0, 300)).slice(0, max) : []);
        const pageUrls = new Set(pages.map((p) => p.url));
        const proof = Array.isArray(parsed.proof_points)
          ? parsed.proof_points
              .filter((p: any) => p && typeof p.text === "string" && p.text.trim())
              .map((p: any) => ({ text: p.text.trim().slice(0, 300), source_url: pageUrls.has(p.source_url) ? p.source_url : null }))
              .slice(0, 8)
          : [];

        const { error: upErr } = await sb.from("competitors").update({
          domain,
          linkedin_url: linkedin,
          identity_verdict: verdict || "match",
          identity_reason: reason,
          positioning: typeof parsed.positioning === "string" ? parsed.positioning.slice(0, 500) : comp.positioning,
          target_segments: asStrings(parsed.target_segments, 6),
          claims: asStrings(parsed.claims, 8),
          proof_points: proof,
          pricing_signals: typeof parsed.pricing_signals === "string" ? parsed.pricing_signals.slice(0, 500) : null,
          strengths: asStrings(parsed.strengths, 5),
          weaknesses: asStrings(parsed.weaknesses, 5),
          evidence,
          confidence: ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "medium",
          researched_at: now(),
        }).eq("id", competitor_id);
        if (upErr) throw new Error(upErr.message);


        await sb.from("competitor_runs").update({
          status: "complete", saved_count: 1, result: { pages: pages.length },
        }).eq("id", runId);
      } catch (e: any) {
        console.error("[competitor-enrich] failed", e?.message);
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
