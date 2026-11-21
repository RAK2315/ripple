import { z } from "zod";
import { structured } from "@/lib/ai/model";
import { fillPlaceholders } from "@/lib/engine/coach";

const schema = z.object({
  paragraphs: z.array(z.string()).describe("2-3 short paragraphs; every figure as a {placeholder}, never a digit"),
});

const SYSTEM = `You write the narrative of a personal monthly money review for an Indian user, in a warm, direct, second-person voice. Our code computed every figure; you may ONLY refer to figures through the {placeholders} given, copied exactly with braces. Never write a digit. Never recommend specific funds, stocks or insurance. Cover: how the month went overall, what moved most versus the previous month, goal progress, and the single biggest opportunity for next month. 2-3 short paragraphs.`;

function template(f: Record<string, string>): string[] {
  return [
    `In ${f.month} you brought in ${f.income_total} and spent ${f.spend_total}, leaving ${f.net}. ${f.top_category} was your biggest category at ${f.top_category_amount}.`,
    `The biggest move versus ${f.prev_month} was ${f.biggest_change_category}, ${f.biggest_change_dir} ${f.biggest_change_amount}. ${f.goal_name} is projected for ${f.goal_projected} against a target of ${f.goal_date}.`,
    `Biggest opportunity for next month: ${f.opportunity}.`,
  ];
}

export async function POST(req: Request) {
  const { facts } = (await req.json()) as { facts: Record<string, string> };
  const prompt = `Placeholders and what they mean:\n${Object.keys(facts)
    .map((k) => `{${k}}`)
    .join(", ")}\nContext (labels only): month under review = {month}, previous = {prev_month}.`;
  const res = await structured({ model: "smart", system: SYSTEM, prompt, schema, timeoutMs: 25000 });
  const filled = res?.paragraphs.map((p) => fillPlaceholders(p, facts));
  const ok = filled && filled.length > 0 && filled.every((p) => p !== null);
  return Response.json({
    ok: true,
    data: { paragraphs: ok ? (filled as string[]) : template(facts), source: ok ? "model" : "template" },
    usedModel: !!res,
    masked: prompt,
  });
}
