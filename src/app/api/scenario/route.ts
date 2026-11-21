import { aiRoute } from "@/lib/ai/meta";
import { z } from "zod";
import { CATEGORIES } from "../../../../contract/types";
import { mask } from "@/lib/ai/mask";
import { structured } from "@/lib/ai/model";
import { regexScenario, type RawAssumption } from "@/lib/scenario-parse";

const schema = z.object({
  name: z.string().describe("short scenario name, 2-5 words"),
  assumptions: z.array(
    z.object({
      kind: z.enum(["category_pct", "category_abs", "category_set", "income_change", "income_pct", "income_stop", "one_off", "add_recurring", "remove_recurring", "goal_change"]),
      category: z.enum(CATEGORIES).nullable(),
      pct: z.number().nullable().describe("percent change, negative for cuts; 'a third' = -33.3"),
      amount_rupees: z.number().nullable().describe("only an amount the user literally stated; positive = more spending/income"),
      label: z.string().nullable(),
      date: z.string().nullable().describe("YYYY-MM-DD for one_off"),
      from_month: z.string().nullable().describe("YYYY-MM when the change starts, if the user said when"),
      recurring_id: z.string().nullable().describe("id from the recurring list, for remove_recurring"),
      goal_id: z.string().nullable(),
      target_amount_rupees: z.number().nullable(),
      target_date: z.string().nullable(),
    }),
  ),
});

const SYSTEM = `Convert a "what if" sentence about personal finances into structured assumptions. Only use numbers the user literally stated; never estimate or compute amounts (our code computes everything from the user's data). Kinds:
- category_pct: change a spending category by a percent (cut eating out by a third → Dining, pct -33.3)
- category_abs: change a category by a stated amount (rent goes up by 6000 → Rent, amount_rupees 6000)
- category_set: a category becomes a stated amount (rent goes to 25k → Rent, amount_rupees 25000)
- income_change: income changes by a stated rupee amount; income_pct: by a percent; income_stop: income stops (quit/lose job), from_month when
- one_off: single expense with amount and date; add_recurring: new monthly cost with amount; remove_recurring: drop an existing recurring payment, by recurring_id from the list
- goal_change: change a goal's target amount or date, by goal_id
"Eating out", food delivery, restaurants = Dining. Moving city usually implies a rent change only if the user states one.`;

export const POST = aiRoute(async function POST(req: Request) {
  const { text, recurring, goals, categoriesWithSpend, today } = (await req.json()) as {
    text: string;
    recurring: { id: string; merchant: string; category: string }[];
    goals: { id: string; name: string }[];
    categoriesWithSpend: string[];
    today: string;
  };
  const prompt = [
    `Today: ${today}`,
    `Sentence: "${mask(text)}"`,
    `Recurring payments (id: merchant, category): ${recurring.map((r) => `${r.id}: ${r.merchant} (${r.category})`).join("; ")}`,
    `Goals (id: name): ${goals.map((g) => `${g.id}: ${g.name}`).join("; ")}`,
    `Categories the user spends in: ${categoriesWithSpend.join(", ")}`,
  ].join("\n");
  const res = await structured({ model: "smart", system: SYSTEM, prompt, schema, timeoutMs: 30000 });
  let assumptions: RawAssumption[] = res?.assumptions ?? [];
  let usedModel = !!res && assumptions.length > 0;
  if (usedModel) {
    // numbers the user literally said ("a third", "6000") are read by our code, not the model:
    // the model's rounding of "a third" (33 vs 33.3) must never move a projection
    const literal = regexScenario(text, recurring, today);
    assumptions = assumptions.map((a) => {
      const l = literal.find((x) => x.kind === a.kind && x.category && x.category === a.category);
      if (!l) return a;
      return a.kind === "category_pct" ? { ...a, pct: l.pct ?? a.pct } : a.kind === "category_abs" || a.kind === "category_set" ? { ...a, amount_rupees: l.amount_rupees ?? a.amount_rupees } : a;
    });
  }
  if (!usedModel) {
    assumptions = regexScenario(text, recurring, today);
    usedModel = false;
  }
  const name = res?.name ?? text.replace(/^what if\s*/i, "").slice(0, 40);
  return Response.json({ ok: true, data: { name, assumptions }, usedModel, masked: prompt });
});
