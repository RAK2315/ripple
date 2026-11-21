import { z } from "zod";
import { aiRoute } from "@/lib/ai/meta";
import { mask } from "@/lib/ai/mask";
import { structured } from "@/lib/ai/model";

/**
 * Plain-language bulk rules. Same pattern as the scenario extractor: the model only reads the sentence into
 * structure (which merchants, which category); the client validates every merchant against the user's data,
 * previews match counts and applies nothing until the user confirms. Names arrive already tokenized by callApi.
 */
const schema = z.object({
  rules: z
    .array(
      z.object({
        merchant: z.string().describe("copied exactly from the merchant list"),
        category: z.string().describe("an existing category, or the new category name the user asked for"),
      }),
    )
    .describe("one entry per merchant the user named"),
  unresolved: z.array(z.string()).describe("parts of the instruction that name no merchant in the list, copied as the user wrote them"),
});

const SYSTEM = `You turn a plain-language instruction about categorizing transactions into rules. The user names one or more merchants and the category they belong in ("put all entries of X and Y as stationery"). For each merchant they name, find it in the merchant list and copy its name exactly; give the category (an existing one if it matches, otherwise the new name the user used, in Title Case). Several merchants in one sentence means several rules. If something the user named is not in the list, put it in unresolved instead of guessing a different merchant. [NAME_n] tokens are privacy masks for people's names: treat them as merchant names and copy them exactly.`;

export const POST = aiRoute(async function POST(req: Request) {
  const { text, merchants, categories } = (await req.json()) as { text: string; merchants: string[]; categories: string[] };
  const prompt = mask(
    [`Instruction: "${text}"`, `Categories: ${categories.join(", ")}`, `Merchant list (most frequent first):`, ...merchants.slice(0, 300).map((m) => `- ${m}`)].join("\n"),
  );
  const res = await structured({ model: "smart", system: SYSTEM, prompt, schema, timeoutMs: 25000 });
  return Response.json({ ok: true, data: res, usedModel: !!res, masked: prompt });
});
