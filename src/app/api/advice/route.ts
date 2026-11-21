import { aiRoute } from "@/lib/ai/meta";
import { z } from "zod";
import { mask } from "@/lib/ai/mask";
import { structured } from "@/lib/ai/model";
import { fillPlaceholders } from "@/lib/engine/coach";

interface Candidate {
  key: string;
  kind: string;
  label: string;
  category: string;
  /** every figure already computed and formatted by the client's engine */
  facts: Record<string, string>;
  /** the step that produces the saving, written by our code ("Cancel the new Country Delight subscription") */
  action: string;
}

const schema = z.object({
  picks: z
    .array(
      z.object({
        key: z.string().describe("the candidate key, copied exactly"),
        why: z.string().describe("one short sentence on why this one matters, in plain words, no numbers or amounts"),
      }),
    )
    .describe("the three candidates most worth the user's attention, best first"),
});

const SYSTEM = `You are RIPPLE's savings coach for an Indian user. You receive savings opportunities that our code already found and priced (action, evidence, saving). Pick the three most worth acting on, best first. For each, write one short sentence in second person on why it matters: habits, convenience costs, small amounts adding up, paying twice for the same thing. Words only: never write a digit, amount, percentage or date, never restate the action or the evidence, never contradict the action, and never recommend specific funds, stocks or insurance.`;

/** The factual clause for each kind, written by our code from computed figures. The model may only place it. */
const EVIDENCE: Record<string, string> = {
  unused_subscription: "You pay {monthly} a month for {label} and nothing else in your spending suggests you use it",
  price_rise: "{label} went from {before} to {after} a month",
  new_subscription: "{label} started on {since} at {monthly} a month",
  rides_with_pass: "Your cab rides cost {ride_spend} a month while you already pay {pass_cost} for {pass}",
  marketplace_orders: "You place about {orders_per_month} online orders a month at {avg_order} each",
  category_growth: "{label} is up {pct}% on three months ago",
};

const TEMPLATE = "{action}. {evidence}, so this saves about {saving} a month.";

/** The model chooses and words the advice; every rupee figure comes from our engine through placeholders. */
function evidenceOf(c: Candidate): string {
  const out = fillPlaceholders(EVIDENCE[c.kind] ?? "{label}", { label: c.label, ...c.facts });
  return out ?? c.label;
}

export const POST = aiRoute(async function POST(req: Request) {
  const { candidates } = (await req.json()) as { candidates: Candidate[] };
  const prompt = candidates
    .map((c) => `key=${c.key} | kind=${c.kind} | action: ${mask(c.action)} | evidence: ${mask(evidenceOf(c))} | saving: ${c.facts.saving}`)
    .join("\n");
  const res = candidates.length ? await structured({ model: "smart", system: SYSTEM, prompt, schema, timeoutMs: 30000 }) : null;

  const byKey = new Map(candidates.map((c) => [c.key, c]));
  // our sentence carries every figure; the model's sentence (if clean) adds the why
  const compose = (c: Candidate, why?: string) => {
    const base = fillPlaceholders(TEMPLATE, { action: c.action, evidence: evidenceOf(c), saving: c.facts.saving }) ?? `${c.action}.`;
    const w = why?.trim().replace(/\s+/g, " ");
    const clean = w && w.length < 200 && !/\d/.test(w) && !/\b(try|buy|check out|sign up|subscribe to|upgrade|offers?)\b/i.test(w);
    return clean ? `${base} ${/[.!]$/.test(w!) ? w : `${w}.`}` : base;
  };
  const chosen: { key: string; text: string; source: "model" | "template" }[] = [];
  for (const p of res?.picks ?? []) {
    const c = byKey.get(p.key);
    if (!c || chosen.some((x) => x.key === p.key)) continue;
    const text = compose(c, p.why);
    chosen.push({ key: c.key, text, source: text.length > compose(c).length ? "model" : "template" });
    if (chosen.length === 3) break;
  }
  // model unavailable or picked fewer than three: top the list up in our own ranking order
  for (const c of candidates) {
    if (chosen.length >= 3) break;
    if (!chosen.some((x) => x.key === c.key)) chosen.push({ key: c.key, text: compose(c), source: "template" });
  }
  return Response.json({ ok: true, data: chosen, usedModel: !!res, masked: prompt });
});
