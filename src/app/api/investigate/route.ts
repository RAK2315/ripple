import { aiRoute } from "@/lib/ai/meta";
import { buildInvestigatePrompt, INVESTIGATE_SYSTEM, planStep, type InvestigateRequest } from "@/lib/ai/investigate";

/**
 * One step of the investigation agent. The client runs every tool through our engine and sends back the
 * results; this route only asks the model which tool to call next (or to finish). No figure is computed here.
 */
export const POST = aiRoute(async function POST(req: Request) {
  const body = (await req.json()) as InvestigateRequest;
  const prompt = buildInvestigatePrompt(body);
  const next = await planStep({ system: INVESTIGATE_SYSTEM, prompt, mustConclude: !!body.mustConclude });
  if (!next) return Response.json({ ok: true, data: { type: "fallback" }, usedModel: false, masked: prompt });
  if (next.tool === "finish") {
    const a = next.args as { explanation?: string; proposal?: { name: string; assumptions: unknown[] } | null };
    return Response.json({ ok: true, data: { type: "conclude", explanation: a.explanation ?? null, proposal: a.proposal ?? null }, usedModel: true, masked: prompt });
  }
  return Response.json({ ok: true, data: { type: "call", tool: next.tool, args: next.args }, usedModel: true, masked: prompt });
});
