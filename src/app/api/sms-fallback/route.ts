import { z } from "zod";
import { mask } from "@/lib/ai/mask";
import { structured } from "@/lib/ai/model";

export const maxDuration = 120;

const schema = z.object({
  rows: z.array(
    z.object({
      i: z.number().int(),
      is_transaction: z.boolean(),
      date: z.string().nullable().describe("YYYY-MM-DD, day-first Indian dates"),
      amount_rupees: z.number().nullable(),
      direction: z.enum(["debit", "credit"]).nullable(),
      merchant: z.string().nullable(),
      account_tail: z.string().nullable().describe("trailing digits of the user's account as shown"),
    }),
  ),
});

const SYSTEM = `You extract transactions from Indian bank SMS alerts that matched none of our regex patterns. For each numbered message return: is_transaction (false for OTPs, offers, reminders, failed/declined); date as YYYY-MM-DD (Indian dates are day-first; assume year 2026 if missing); amount_rupees exactly as written in the message (never compute or guess); direction; merchant/payee as written; account_tail digits. [NAME], [PHONE] and XX1234 are privacy masks; keep them as-is.`;

/** Extraction, not calculation: the model copies the amount the SMS states. We convert to paise. */
export async function POST(req: Request) {
  const { messages } = (await req.json()) as { messages: string[] };
  const masked = messages.map((m, i) => `${i}. ${mask(m).replace(/\n/g, " ")}`).join("\n");
  const res = await structured({ model: "fast", system: SYSTEM, prompt: masked, schema });
  const data = messages.map((_, i) => {
    const r = res?.rows.find((x) => x.i === i);
    if (!r) return null;
    return {
      is_transaction: r.is_transaction,
      date: r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null,
      amount: r.amount_rupees != null && r.amount_rupees > 0 ? Math.round(r.amount_rupees * 100) : null,
      direction: r.direction,
      merchant: r.merchant,
      account_tail: r.account_tail && /^\d{3,4}$/.test(r.account_tail) ? r.account_tail : null,
    };
  });
  return Response.json({ ok: true, data, usedModel: !!res, masked });
}
