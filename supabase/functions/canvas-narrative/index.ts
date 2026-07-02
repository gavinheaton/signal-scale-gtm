// Generate the expanded prose business-model doc from the canvas + platform data.
import { corsHeaders } from "../_shared/cors.ts";
import { requireUser, serviceClient, assertProjectAccess } from "../_shared/auth.ts";

interface Body { canvas_id: string }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { user } = await requireUser(req, corsHeaders);
    const { canvas_id } = (await req.json()) as Body;
    if (!canvas_id) throw new Error("canvas_id required");
    const svc = serviceClient();

    const { data: canvas } = await svc.from("canvases").select("id, project_id, variant").eq("id", canvas_id).maybeSingle();
    if (!canvas) throw new Error("Canvas not found");
    await assertProjectAccess(svc, user.id, canvas.project_id);

    const [proj, entries, icps, personas, vps, campaigns] = await Promise.all([
      svc.from("projects").select("name, website_url").eq("id", canvas.project_id).maybeSingle(),
      svc.from("canvas_entries").select("box, content, status, source").eq("canvas_id", canvas_id).order("box").order("position"),
      svc.from("icps").select("segment_name, firmographics, fit_score, access_score, matrix_category").eq("project_id", canvas.project_id),
      svc.from("personas").select("persona_name, role_in_buying, pain_points, goals, how_we_help").eq("project_id", canvas.project_id),
      svc.from("value_propositions").select("statement, is_primary").eq("project_id", canvas.project_id),
      svc.from("campaigns").select("name, track, objective, status").eq("project_id", canvas.project_id),
    ]);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const system = `You are a business-model narrator. Write a clear, board-ready business model document in Markdown, expanding each box of the Disruptors Canvas with reasoning and evidence drawn from the platform context. Use H2 per section (Problem, Solution, USP, Unfair Advantage, Customer Segments, Metrics, Channels, Cost Structure, Revenue Streams — plus Shared Value sections if variant is shared_value). Cite the underlying ICPs, personas, and campaigns by name where relevant. Flag any assumption still unvalidated with **(assumption)**. Length: ~800-1200 words.`;

    const context = { project: proj.data, entries: entries.data, icps: icps.data, personas: personas.data, value_propositions: vps.data, campaigns: campaigns.data };

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          { role: "user", content: `Variant: ${canvas.variant}\n\nContext:\n${JSON.stringify(context, null, 2)}` },
        ],
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      return new Response(JSON.stringify({ error: `AI error: ${r.status} ${t}` }), {
        status: r.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const j = await r.json();
    const narrative = j.choices?.[0]?.message?.content || "";
    const generated_at = new Date().toISOString();
    await svc.from("canvases").update({ narrative_md: narrative, narrative_generated_at: generated_at }).eq("id", canvas_id);

    return Response.json({ narrative_md: narrative, narrative_generated_at: generated_at }, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return new Response(JSON.stringify({ error: e.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
