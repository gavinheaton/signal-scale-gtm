// Suggest open-ended guiding questions for a Conversation Canvas.
import { corsHeaders } from "../_shared/cors.ts";
import { requireUser, serviceClient, assertProjectAccess } from "../_shared/auth.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

interface Body { conversation_id: string }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    let user;
    try { ({ user } = await requireUser(req, corsHeaders)); }
    catch (r) { return r as Response; }
    const { conversation_id }: Body = await req.json();
    if (!conversation_id) return json({ error: "conversation_id required" }, 400);

    const sb = serviceClient();
    const { data: conv, error } = await sb.from("discovery_conversations")
      .select("*, discovery_contacts!inner(persona_id, discovery_organizations!inner(discovery_campaigns!inner(project_id)))")
      .eq("id", conversation_id).maybeSingle();
    if (error || !conv) return json({ error: "Conversation not found" }, 404);
    const projectId = (conv as any).discovery_contacts.discovery_organizations.discovery_campaigns.project_id;
    try { await assertProjectAccess(sb, user.id, projectId); }
    catch (e: any) { return json({ error: e?.message || "Forbidden" }, 403); }

    const personaId = (conv as any).discovery_contacts.persona_id;
    let persona: any = null;
    if (personaId) {
      const { data: p } = await sb.from("personas").select("persona_name, role_in_buying, goals, pain_points, how_we_help").eq("id", personaId).maybeSingle();
      persona = p;
    }

    const ai = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: `You write open-ended customer discovery questions in the "Tell me about the last time you…" style. Return ONLY JSON: {"questions": string[]}. Produce 5-8 questions. Hard rules: every question is open-ended, never yes/no, and grounded in past behaviour rather than hypotheticals or solution-pitching.` },
          { role: "user", content: JSON.stringify({
            objective: conv.objective,
            key_topics: conv.key_topics,
            persona,
          }) },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!ai.ok) return json({ error: `AI failed: ${ai.status}` }, 502);
    const data = await ai.json();
    let parsed: any = {};
    try { parsed = JSON.parse(data?.choices?.[0]?.message?.content); } catch { /* ignore */ }
    return json({ questions: parsed.questions || [] });
  } catch (e: any) {
    console.error(e);
    return json({ error: e?.message || "Internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
