// AI assistant for the Value Proposition module.
// Actions: brainstorm_problems | draft_statement | variations | critique
import { corsHeaders } from "../_shared/cors.ts";
import { requireUser, serviceClient, assertProjectAccess } from "../_shared/auth.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

type Action = "brainstorm_problems" | "draft_statement" | "variations" | "critique";

interface Body {
  action: Action;
  project_id: string;
  icp_id?: string | null;
  persona_id?: string | null;
  format?: "memory_dart" | "elevator_pitch";
  fields?: Record<string, string>;
  statement?: string;
  problems?: string[];
  tone_variants?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    let user;
    try { ({ user } = await requireUser(req, corsHeaders)); }
    catch (r) { return r as Response; }

    const body: Body = await req.json();
    if (!body?.action || !body?.project_id) return json({ error: "action and project_id required" }, 400);

    const sb = serviceClient();
    try { await assertProjectAccess(sb, user.id, body.project_id); }
    catch (e: any) { return json({ error: e?.message || "Forbidden" }, 403); }

    // Gather context
    const [projRes, bvRes, icpRes, personaRes, allIcpsRes, allPersonasRes] = await Promise.all([
      sb.from("projects").select("name").eq("id", body.project_id).maybeSingle(),
      sb.from("brand_voices").select("brand_name, tagline, tone_attributes, positioning, differentiators, voice_summary, website_url").eq("project_id", body.project_id).limit(1).maybeSingle(),
      body.icp_id ? sb.from("icps").select("*").eq("id", body.icp_id).maybeSingle() : Promise.resolve({ data: null }),
      body.persona_id ? sb.from("personas").select("*").eq("id", body.persona_id).maybeSingle() : Promise.resolve({ data: null }),
      sb.from("icps").select("id, segment_name, firmographics, anti_icp_signals").eq("project_id", body.project_id),
      sb.from("personas").select("id, persona_name, role_in_buying, goals, pain_points, how_we_help").eq("project_id", body.project_id),
    ]);

    const ctx = {
      project_name: (projRes as any)?.data?.name || null,
      brand_voice: bvRes?.data || null,
      target_icp: (icpRes as any)?.data || null,
      target_persona: (personaRes as any)?.data || null,
      other_icps: (allIcpsRes as any)?.data || [],
      other_personas: (allPersonasRes as any)?.data || [],
    };

    const model = "google/gemini-2.5-flash";
    const sys = buildSystemPrompt(body.action);
    const usr = buildUserPayload(body, ctx);

    const ai = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: JSON.stringify(usr) },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (ai.status === 429) return json({ error: "Rate limit exceeded, try again shortly." }, 429);
    if (ai.status === 402) return json({ error: "AI credits exhausted. Please add credits in Settings." }, 402);
    if (!ai.ok) return json({ error: `AI failed: ${ai.status}` }, 502);

    const data = await ai.json();
    let parsed: any = {};
    try { parsed = JSON.parse(data?.choices?.[0]?.message?.content || "{}"); }
    catch { return json({ error: "Malformed AI response" }, 502); }

    return json({ result: parsed, model });
  } catch (e: any) {
    console.error("value-prop-assist error:", e);
    return json({ error: e?.message || "Internal error" }, 500);
  }
});

function buildSystemPrompt(action: Action): string {
  const base = `You are a value proposition strategist. You write in a crisp, plain-spoken B2B tone grounded in customer language. Always return JSON only.

Speaker identity: When drafting any first-person or brand self-reference slot (e.g. "i_am", "solution"), the speaker is the project itself — use the "project_name" from context as the identity. Never introduce, cite, or credit any agency, consultancy, methodology author, or framework name (e.g. do not mention "Disruptors Co", "DH18", "Memory Dart author", "handbook"). Use brand_voice fields only for tone, positioning, and differentiators — not as the speaker's identity unless brand_voice.brand_name matches the project.`;

  switch (action) {
    case "brainstorm_problems":
      return `${base}

Task: Brainstorm the top customer problems for the given ICP/persona. Score each problem against 4 criteria for "problems worth solving":
1. has_owner — someone is accountable for it today
2. tried_and_failed — they've attempted a fix that didn't work
3. saves_or_makes_money — solving it moves revenue or cost
4. broader_impact — the fix ripples beyond the immediate team

Return JSON: {"problems":[{"problem": string, "has_owner": bool, "tried_and_failed": bool, "saves_or_makes_money": bool, "broader_impact": bool, "rationale": string}]}
Produce 5-8 problems, ordered highest-value first. Use the customer's likely language, not vendor jargon.`;

    case "draft_statement":
      return `${base}

Task: Draft the value proposition slots for the requested format.

If format = "memory_dart" (Steve Woodruff's Memory Dart):
Return JSON: {"fields": {"i_am": string, "i_help": string, "impact_direction": "reduce"|"increase", "impact_metric": string, "impact_size": string}, "statement": string, "rationale": string}
- i_am: brand + short descriptor
- i_help: bullseye customer (segment / role)
- impact_metric: the pain point + measurement (e.g. "customer onboarding time")
- impact_size: the size/comparison of impact (e.g. "by 60% in 90 days")
- statement: assemble the 4 lines into one crisp sentence

If format = "elevator_pitch":
Return JSON: {"fields": {"solution": string, "segment": string, "jtbd": string, "reduction_type": string, "reduction_pain": string, "improvement_type": string, "improvement_benefit": string, "unlike": string}, "statement": string, "rationale": string}
- solution: from the brand's canvas
- segment: customer segments and personas
- jtbd: the pressing need / job to be done
- reduction_pain: the pain point you solve
- improvement_benefit: the customer benefit you create
- unlike: competitor positioning contrast
- statement: assemble into a single paragraph

Ground every slot in the ICP firmographics, persona pains/goals, brand differentiators, and the supplied problems list. Do not invent metrics — use qualitative language when numbers aren't provided.`;

    case "variations":
      return `${base}

Task: Given a base statement, produce 3 tonal variations that preserve meaning but change angle. Return JSON: {"variations":[{"label": string, "statement": string, "angle": string}]}. Angles to cover: (1) outcome-led, (2) pain-led, (3) contrast/anti-competitor. Match the brand voice.`;

    case "critique":
      return `${base}

Task: Critique the given value proposition against the handbook criteria: audience specificity, problem clarity, measurable impact, differentiation, and language of the customer. Return JSON: {"score": 0-10, "strengths": string[], "gaps": string[], "rewrite_suggestion": string}.`;
  }
}

function buildUserPayload(body: Body, ctx: any) {
  return {
    action: body.action,
    format: body.format,
    current_fields: body.fields || {},
    current_statement: body.statement || "",
    problems: body.problems || [],
    tone_variants: body.tone_variants || 3,
    context: ctx,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
