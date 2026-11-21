import { aiRoute } from "@/lib/ai/meta";
import { z } from "zod";
import { mask } from "@/lib/ai/mask";
import { structured } from "@/lib/ai/model";

interface Item {
  id: string;
  merchant: string;
  category: string;
  before_rupees: number;
  after_rupees: number;
  changed_on: string;
}

const schema = z.object({
  lines: z.array(z.object({ id: z.string(), why: z.string().describe("one short sentence, no numbers or amounts") })),
});

const SYSTEM = `For each recurring payment that changed amount, write ONE short plain sentence on the most likely reason (plan upgrade, price increase, annual revision, added a family member, etc.) and what the user could check. Do NOT write any number, amount, percentage or date: the app shows those itself. Use the id given.`;

const template = (it: Item) =>
  it.after_rupees > it.before_rupees
    ? `${it.merchant} now charges more than before; usually a plan upgrade or a price revision. Check whether you need the higher tier.`
    : `${it.merchant} now charges less than before; a downgrade or discount took effect.`;

/** The model explains in words only. Any line containing a digit is rejected so no figure can come from the model. */
export const POST = aiRoute(async function POST(req: Request) {
  const { items } = (await req.json()) as { items: Item[] };
  const prompt = items
    .map((it) => `${it.id}: ${mask(it.merchant)} (${it.category}) changed from ₹${it.before_rupees} to ₹${it.after_rupees} per charge on ${it.changed_on}`)
    .join("\n");
  const res = items.length ? await structured({ model: "smart", system: SYSTEM, prompt, schema, timeoutMs: 20000 }) : null;
  const data: Record<string, { why: string; source: "model" | "template" }> = {};
  for (const it of items) {
    const line = res?.lines.find((l) => l.id === it.id)?.why?.trim();
    data[it.id] = line && !/\d/.test(line) && line.length < 220 ? { why: line, source: "model" } : { why: template(it), source: "template" };
  }
  return Response.json({ ok: true, data, usedModel: !!res, masked: prompt });
});
