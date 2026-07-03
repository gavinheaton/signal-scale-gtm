// Critique the whole canvas: alignment issues, weak boxes, gaps.
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

    const { data: entries } = await svc
      .from("canvas_entries")
      .select("box, content, status, source, updated_at")
      .eq("canvas_id", canvas_id)
      .order("updated_at", { ascending: false });

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const system = `You review Disruptors Canvas business models. Treat AI-suggested and auto-imported entries as first-class content alongside user entries — critique them all equally. Pay attention to recently updated entries (they represent the current thinking). Check that every PROBLEM has a matching SOLUTION, USP is analogy-based (not a feature list), Customer Segments align with Channels, Revenue Streams cover Cost Structure. Return STRICT JSON:
{
  "alignment_issues": [{"boxes": ["problem","solution"], "issue": "...", "fix": "..."}],
  "weak_boxes": [{"box":"usp","issue":"..."}],
  "gaps": [{"box":"cost_structure","issue":"empty"}],
  "validation_coverage_pct": 0-100,
  "summary": "one-sentence overall verdict"
}`;

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          { role: "user", content: `Variant: ${canvas.variant}\n\nEntries:\n${JSON.stringify(entries || [], null, 2)}` },
        ],
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
    let critique: any = {};
    try { critique = JSON.parse(j.choices?.[0]?.message?.content || "{}"); } catch { critique = { error: "parse_failed" }; }

    await svc.from("canvases").update({ critique, critique_generated_at: new Date().toISOString() }).eq("id", canvas_id);

    return Response.json({ critique }, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return new Response(JSON.stringify({ error: e.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
