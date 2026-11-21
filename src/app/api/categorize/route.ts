import { aiRoute } from "@/lib/ai/meta";
import { z } from "zod";
import { CATEGORIES } from "../../../../contract/types";
import type { Category, LlmCategory } from "@/lib/types";
import { categorizeLines, type CategorizeItem } from "@/lib/ai/payloads";
import { structured } from "@/lib/ai/model";
import { heuristicCategory } from "@/lib/ai/heuristics";

export const maxDuration = 120;

type Item = CategorizeItem;

// built per request: the user's own categories (e.g. "Stationery") join the fixed list
const schemaFor = (cats: string[]) => z.object({
  results: z.array(
    z.object({
      i: z.number().int(),
      category: z.enum(cats as [string, ...string[]]),
      confidence: z.number().min(0).max(1),
      merchant: z.string(),
    }),
  ),
});

const systemFor = (cats: string[]) => `You categorize Indian bank transactions. For each numbered line return its index i, one category from this exact list: ${cats.join(", ")}; a confidence 0..1; and a clean, short merchant name (e.g. "Swiggy", "Bhagwati Tiffin Service"). [NAME] and [NAME_1], [NAME_2]… (a person's name), [PHONE] and XX1234 are privacy masks; a payment to a [NAME…] is a person-to-person transfer. Use confidence below 0.7 when the merchant is a small local business you cannot identify with certainty, or a person-to-person transfer whose purpose is unclear. Each line shows a typical amount, day of month and how often it occurs: a large fixed monthly transfer to a person early in the month is likely Rent; a regular transfer to a family-sounding note is Family Transfer. Never invent amounts.`;

export const POST = aiRoute(async function POST(req: Request) {
  const { items, customCategories } = (await req.json()) as { items: Item[]; customCategories?: string[] };
  const cats = [...CATEGORIES, ...(Array.isArray(customCategories) ? customCategories.filter((c) => typeof c === "string" && c.trim() && !(CATEGORIES as readonly string[]).includes(c)) : [])];
  const schema = schemaFor(cats);
  const SYSTEM = systemFor(cats);
  const out: Record<string, LlmCategory> = {};
  const payloads: string[] = [];
  let usedModel = false;
  for (let start = 0; start < items.length; start += 40) {
    const batch = items.slice(start, start + 40);
    const lines = categorizeLines(batch);
    payloads.push(lines);
    const res = await structured({ model: "fast", system: SYSTEM, prompt: lines, schema });
    batch.forEach((it, i) => {
      const r = res?.results.find((x) => x.i === i);
      if (r) {
        usedModel = true;
        out[it.key] = { category: r.category as Category, confidence: r.confidence, merchant: r.merchant && !/\[|\]|XX\d|NAME_?\d|UPI-ID|PHONE/i.test(r.merchant) ? r.merchant : it.merchant };
      } else {
        const h = heuristicCategory(it.description, it.direction, it);
        out[it.key] = { ...h, merchant: it.merchant };
      }
    });
  }
  return Response.json({ ok: true, data: out, usedModel, masked: payloads.join("\n---\n") });
});
