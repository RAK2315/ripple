import { z } from "zod";
import { CATEGORIES } from "../../../../contract/types";
import type { Category, LlmCategory } from "@/lib/types";
import { mask } from "@/lib/ai/mask";
import { structured } from "@/lib/ai/model";
import { heuristicCategory } from "@/lib/ai/heuristics";

export const maxDuration = 120;

interface Item {
  key: string;
  description: string;
  direction: "debit" | "credit";
  merchant: string;
  amount_rupees: number;
  day: number;
  count: number;
}

const schema = z.object({
  results: z.array(
    z.object({
      i: z.number().int(),
      category: z.enum(CATEGORIES),
      confidence: z.number().min(0).max(1),
      merchant: z.string(),
    }),
  ),
});

const SYSTEM = `You categorize Indian bank transactions. For each numbered line return its index i, one category from this exact list: ${CATEGORIES.join(", ")}; a confidence 0..1; and a clean, short merchant name (e.g. "Swiggy", "Bhagwati Tiffin Service"). [NAME], [PHONE] and XX1234 are privacy masks. Use confidence below 0.7 when the merchant is a small local business you cannot identify with certainty, or a person-to-person transfer whose purpose is unclear. Each line shows a typical amount, day of month and how often it occurs: a large fixed monthly transfer to a person early in the month is likely Rent; a regular transfer to a family-sounding note is Family Transfer. Never invent amounts.`;

export async function POST(req: Request) {
  const { items } = (await req.json()) as { items: Item[] };
  const out: Record<string, LlmCategory> = {};
  const payloads: string[] = [];
  let usedModel = false;
  for (let start = 0; start < items.length; start += 40) {
    const batch = items.slice(start, start + 40);
    const lines = batch.map((it, i) => `${i}. [${it.direction}] ${mask(it.description)} | ~₹${it.amount_rupees} | day ${it.day} | seen ${it.count}x`).join("\n");
    payloads.push(lines);
    const res = await structured({ model: "fast", system: SYSTEM, prompt: lines, schema });
    batch.forEach((it, i) => {
      const r = res?.results.find((x) => x.i === i);
      if (r) {
        usedModel = true;
        out[it.key] = { category: r.category as Category, confidence: r.confidence, merchant: r.merchant && !/\[|XX\d/.test(r.merchant) ? r.merchant : it.merchant };
      } else {
        const h = heuristicCategory(it.description, it.direction, it);
        out[it.key] = { ...h, merchant: it.merchant };
      }
    });
  }
  return Response.json({ ok: true, data: out, usedModel, masked: payloads.join("\n---\n") });
}
