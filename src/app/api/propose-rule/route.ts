import { aiRoute } from "@/lib/ai/meta";
import { z } from "zod";
import { CATEGORIES } from "../../../../contract/types";
import { mask } from "@/lib/ai/mask";
import { structured } from "@/lib/ai/model";
import { isGenericToken, meaningfulTokens } from "@/lib/engine/merchants";

const schema = z.object({
  type: z.enum(["contains", "merchant_equals", "amount_range", "recurring_date"]),
  pattern: z.string().describe("for contains/amount_range/recurring_date: a substring copied exactly from the description; for merchant_equals: the merchant name"),
  amount_min_rupees: z.number().nullable(),
  amount_max_rupees: z.number().nullable(),
  day_of_month: z.number().int().nullable(),
  rationale: z.string().describe("one short sentence on why this generalizes"),
});

const SYSTEM = `A user corrected a transaction category. Propose ONE general categorization rule that captures the user's intent for all similar transactions, not just this row. Rule types: contains (description contains text), merchant_equals, amount_range (description contains text AND amount within range; use only when the same merchant clearly means different things at different amounts), recurring_date (description contains text AND charged around a day of month; use only for fixed monthly payments). Prefer the simplest rule: usually "contains" with the most distinctive merchant text. The pattern must be copied verbatim from the description, must not be generic (UPI, POS, HDFC, ICICI, PAYMENT, NEFT, IMPS) and must not include reference numbers. Categories: ${CATEGORIES.join(", ")}.`;

interface Body {
  description: string;
  merchant: string;
  amount: number;
  date: string;
  oldCategory: string;
  newCategory: string;
  examples: string[];
}

export const POST = aiRoute(async function POST(req: Request) {
  const b = (await req.json()) as Body;
  const masked = [
    `Corrected transaction: ${mask(b.description)}`,
    `Merchant: ${mask(b.merchant)}`,
    `Amount: ₹${Math.round(b.amount / 100)} on ${b.date}`,
    `Category changed from ${b.oldCategory} to ${b.newCategory}`,
    `Other transactions from the same merchant:`,
    ...b.examples.slice(0, 8).map((e) => `- ${mask(e)}`),
  ].join("\n");
  const res = await structured({ model: "smart", system: SYSTEM, prompt: masked, schema, timeoutMs: 30000 });

  const descU = b.description.toUpperCase();
  const valid =
    res &&
    !isGenericToken(res.pattern) &&
    (res.type === "merchant_equals" ? res.pattern.trim().length >= 3 : descU.includes(res.pattern.trim().toUpperCase())) &&
    !/\d{6,}/.test(res.pattern);

  const rule = valid
    ? {
        type: res!.type,
        pattern: res!.pattern.trim().toUpperCase(),
        amount_min: res!.amount_min_rupees != null ? Math.round(res!.amount_min_rupees * 100) : undefined,
        amount_max: res!.amount_max_rupees != null ? Math.round(res!.amount_max_rupees * 100) : undefined,
        day_of_month: res!.day_of_month ?? undefined,
        rationale: res!.rationale,
      }
    : fallbackRule(b);
  return Response.json({ ok: true, data: rule, usedModel: !!valid, masked });
});

/** Deterministic fallback: the merchant name if it appears in the description, else the longest run of meaningful tokens. */
function fallbackRule(b: Body) {
  const descU = b.description.toUpperCase();
  const m = b.merchant.toUpperCase();
  if (m.length >= 4 && descU.includes(m)) return { type: "contains" as const, pattern: m, rationale: "Matches every transaction from this merchant." };
  const tokens = meaningfulTokens(b.description).filter((t) => !/^[A-Z]?\d+$/.test(t));
  const pattern = tokens.slice(0, 2).join(" ");
  const usable = pattern && descU.includes(pattern) ? pattern : (tokens[0] ?? m);
  return { type: "contains" as const, pattern: usable, rationale: "Matches the distinctive text in this description." };
}
