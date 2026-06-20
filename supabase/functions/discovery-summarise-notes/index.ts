// Summarise raw conversation notes into observation-only insights (with verbatim quotes) + next steps.
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
      .select("raw_notes, objective, key_topics, discovery_contacts!inner(discovery_organizations!inner(discovery_campaigns!inner(project_id)))")
      .eq("id", conversation_id).maybeSingle();
    if (error || !conv) return json({ error: "Conversation not found" }, 404);
    const projectId = (conv as any).discovery_contacts.discovery_organizations.discovery_campaigns.project_id;
    try { await assertProjectAccess(sb, user.id, projectId); }
    catch (e: any) { return json({ error: e?.message || "Forbidden" }, 403); }
    if (!conv.raw_notes?.trim()) return json({ error: "No raw_notes to summarise" }, 400);

    const ai = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: `You extract OBSERVATIONS from raw customer conversation notes. Return ONLY JSON: {"insights":[{"text":string,"is_quote":boolean}],"next_steps":string}. Hard rules: never include interpretation or your own opinion — observations only. Mark is_quote=true ONLY for verbatim things the customer said (preserve their wording). Mark is_quote=false for paraphrased factual observations. Produce 5-15 insights. next_steps is a short paragraph of concrete follow-ups.` },
          { role: "user", content: JSON.stringify({
            objective: conv.objective,
            key_topics: conv.key_topics,
            raw_notes: conv.raw_notes.slice(0, 12000),
          }) },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!ai.ok) return json({ error: `AI failed: ${ai.status}` }, 502);
    const data = await ai.json();
    let parsed: any = {};
    try { parsed = JSON.parse(data?.choices?.[0]?.message?.content); } catch { /* ignore */ }
    return json({ insights: parsed.insights || [], next_steps: parsed.next_steps || "" });
  } catch (e: any) {
    console.error(e);
    return json({ error: e?.message || "Internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
