// Suggest 2-3 AI entries for a canvas box using project context.
import { corsHeaders } from "../_shared/cors.ts";
import { requireUser, serviceClient, assertProjectAccess } from "../_shared/auth.ts";

interface Body { canvas_id: string; box: string; count?: number }

const BOX_PROMPTS: Record<string, string> = {
  problem: "the customer's most urgent, worth-solving problems",
  solution: "how the business solves the problem in <=25 words each",
  usp: "an analogy-style unique selling proposition (like 'Uber for X')",
  unfair_advantage: "resources or capabilities competitors cannot easily copy",
  customer_segments: "specific initial target segments with demographics/motivations",
  metrics: "key measurements proving the solution solves the problem",
  channels: "media and routes-to-market to reach customers",
  cost_structure: "the main cost lines to build and run the solution",
  revenue_streams: "how the business makes money and pricing model options",
  vp_stakeholder: "value proposition specifically to investors/stakeholders",
  vp_community: "value proposition to the wider community",
  vp_customer: "value proposition to end customers",
  social_impact: "measurable social/environmental impact created",
  key_partners: "key external partners, suppliers, and alliances required",
  key_activities: "the most important activities the business must perform",
  key_resources: "the critical resources (physical, IP, human, financial) required",
  value_propositions: "the bundles of products/services that create value for each segment",
  customer_relationships: "the type of relationship established with each customer segment",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { user } = await requireUser(req, corsHeaders);
    const { canvas_id, box, count } = (await req.json()) as Body;
    if (!canvas_id || !box) throw new Error("canvas_id and box required");
    const n = Math.min(Math.max(count ?? 5, 1), 8);
    const svc = serviceClient();

    const { data: canvas } = await svc.from("canvases").select("id, project_id, variant").eq("id", canvas_id).maybeSingle();
    if (!canvas) throw new Error("Canvas not found");
    await assertProjectAccess(svc, user.id, canvas.project_id);

    const [proj, icps, personas, vps, problems, entries, comps, white] = await Promise.all([
      svc.from("projects").select("name, website_url").eq("id", canvas.project_id).maybeSingle(),
      svc.from("icps").select("segment_name, firmographics, matrix_category").eq("project_id", canvas.project_id),
      svc.from("personas").select("persona_name, pain_points, goals, how_we_help").eq("project_id", canvas.project_id),
      svc.from("value_propositions").select("statement, is_primary").eq("project_id", canvas.project_id),
      svc.from("value_prop_problems").select("problem").eq("project_id", canvas.project_id).limit(10),
      svc.from("canvas_entries").select("box, content").eq("canvas_id", canvas_id),
      svc.from("competitors").select("name, type, positioning, claims, strengths, weaknesses, pricing_signals")
        .eq("project_id", canvas.project_id).eq("status", "confirmed"),
      svc.from("competitive_whitespace").select("kind, title, rationale")
        .eq("project_id", canvas.project_id),
    ]);

    const context = {
      project: proj.data,
      icps: icps.data,
      personas: personas.data,
      value_propositions: vps.data,
      problems: problems.data,
      competitors: comps.data,
      competitive_whitespace: white.data,
      existing_canvas: entries.data,
    };

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const system = `You are a startup business-model strategist filling in the Disruptors Canvas. Return concise, punchy suggestions (max 25 words each). Do not repeat any content already listed in existing_canvas. Return STRICT JSON only: {"suggestions": ["...", "..."]}`;
    const userPrompt = `Suggest ${n} distinct entries for the "${box}" box — ${BOX_PROMPTS[box] || box}.\n\nProject context:\n${JSON.stringify(context, null, 2)}`;

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: system }, { role: "user", content: userPrompt }],
        response_format: { type: "json_object" },
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      return new Response(JSON.stringify({ error: `AI error: ${r.status} ${t}` }), {
        status: r.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const j = await r.json();
    const raw = j.choices?.[0]?.message?.content || "{}";
    let suggestions: string[] = [];
    try { suggestions = (JSON.parse(raw).suggestions || []).slice(0, n); } catch { suggestions = []; }

    return Response.json({ suggestions }, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return new Response(JSON.stringify({ error: e.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
