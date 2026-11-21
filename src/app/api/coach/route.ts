import { z } from "zod";
import { mask } from "@/lib/ai/mask";
import { structured } from "@/lib/ai/model";
import { fillPlaceholders, isSecuritiesQuestion } from "@/lib/engine/coach";

const schema = z.object({
  out_of_scope: z.boolean().describe("true if the user asks which security, stock, fund or insurance product to buy"),
  answer: z.string().describe("2-4 plain sentences; every figure as a {placeholder} from the list, never a digit"),
});

const BOUNDARY = `You are RIPPLE, a personal finance coach for an Indian user. You educate and model scenarios. You NEVER recommend or name specific securities, stocks, mutual funds, ETFs, insurance products or providers. You NEVER write a digit or compute anything: every figure must be one of the {placeholders} provided, copied exactly with braces.`;

const REFUSAL_SYSTEM = `${BOUNDARY}
The user asked you to pick a financial product. Write: (1) one sentence saying plainly you don't recommend specific funds, stocks or insurance products; (2) two sentences explaining the general concept they asked about (e.g. what a mutual fund or a SIP is, how risk and time horizon matter), with no product or company names; (3) one sentence offering what you can do instead: the monthly amount for their goal is shown below, using {goal_name}, {goal_date} and {monthly_plain}.`;

const ANSWER_SYSTEM = `${BOUNDARY}
Answer the user's question about their own money in 2-4 sentences, using only the placeholders for any figure. If the question is about something you can't see in the data, say so.`;

const CONCEPT_FALLBACK = (facts: Record<string, string>) =>
  `I don't recommend specific mutual funds, stocks or insurance products. A mutual fund pools many people's money into a basket of investments, and a SIP (systematic investment plan) is simply a fixed amount put in every month; how much risk makes sense depends on how soon you need the money. What I can do is model your goal: to reach ${facts.goal_name} by ${facts.goal_date}, you need to set aside ${facts.monthly_plain} a month.`;

const ANSWER_FALLBACK = (facts: Record<string, string>) =>
  `Here is what your numbers say: your monthly surplus is ${facts.surplus}, and ${facts.goal_name} lands in ${facts.goal_projected} against a target of ${facts.goal_date}. Try a "what if" on the Scenarios screen to see how a change moves it.`;

/** facts = figures computed client-side by the engine, already formatted. The model only places them. */
export async function POST(req: Request) {
  const { question, facts } = (await req.json()) as { question: string; facts: Record<string, string> };
  const ruleRefused = isSecuritiesQuestion(question);
  const masked = mask(question);
  const prompt = `Question: "${masked}"\nPlaceholders you may use: ${Object.keys(facts)
    .map((k) => `{${k}}`)
    .join(", ")}`;
  const res = await structured({ model: "smart", system: ruleRefused ? REFUSAL_SYSTEM : ANSWER_SYSTEM, prompt, schema, timeoutMs: 25000 });
  const refused = ruleRefused || !!res?.out_of_scope;
  let text = res ? fillPlaceholders(res.answer, facts) : null;
  // a model-side refusal on an answer prompt still needs the concept + computed amount
  if (refused && !ruleRefused) text = null;
  const source = text ? "model" : "template";
  if (!text) text = refused ? CONCEPT_FALLBACK(facts) : ANSWER_FALLBACK(facts);
  return Response.json({ ok: true, data: { refused, text, source }, usedModel: !!res, masked: prompt });
}
