import { generateText, tool } from "ai";
import { groq } from "@ai-sdk/groq";
import { z } from "zod";
import { CATEGORIES } from "../../../contract/types";
import { hasKey, MODELS } from "./model";
import { mask } from "./mask";
import { recordCall } from "./meta";

/**
 * Investigation agent, model side. One planning step per call: the model sees the question and the (masked)
 * results so far and picks exactly one tool. Tools have no execute here: the client runs them through our engine.
 * Sibling of structured() in model.ts, which is left untouched. Callers pass ALREADY MASKED text.
 */

const rawAssumption = z.object({
  kind: z.enum(["category_pct", "category_abs", "category_set", "income_change", "income_pct", "income_stop", "one_off", "add_recurring", "remove_recurring", "goal_change"]),
  category: z.enum(CATEGORIES).nullable().optional(),
  pct: z.number().nullable().optional().describe("percent change, negative for cuts (cut by a fifth = -20)"),
  amount_rupees: z.number().nullable().optional().describe("rupee parameter; positive = more spending or income"),
  label: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
  from_month: z.string().nullable().optional().describe("YYYY-MM"),
  recurring_id: z.string().nullable().optional().describe("recurring_id from get_recurring, for remove_recurring"),
  goal_id: z.string().nullable().optional(),
  target_amount_rupees: z.number().nullable().optional(),
  target_date: z.string().nullable().optional(),
});

export const INVESTIGATE_TOOLS = {
  query_transactions: tool({
    description: "Filter the user's transactions. Returns count, total, monthly totals and top merchants. All filters optional.",
    inputSchema: z.object({
      category: z.enum(CATEGORIES).nullable().optional(),
      date_from: z.string().nullable().optional().describe("YYYY-MM-DD"),
      date_to: z.string().nullable().optional().describe("YYYY-MM-DD"),
      merchant: z.string().nullable().optional().describe("substring of the merchant name"),
      min_amount_rupees: z.number().nullable().optional(),
      direction: z.enum(["debit", "credit"]).nullable().optional(),
    }),
  }),
  get_recurring: tool({
    description: "Recurring payments (subscriptions, rent, bills) with monthly cost. status: active, changed (price changed), unused, new; omit for all.",
    inputSchema: z.object({ status: z.enum(["active", "changed", "unused", "new"]).nullable().optional() }),
  }),
  get_goals: tool({
    description: "The user's savings goals: target, due month, projected month, on track or months late.",
    inputSchema: z.object({}),
  }),
  get_profile: tool({
    description: "Monthly income, fixed costs, variable spend, surplus, balance and the biggest variable categories.",
    inputSchema: z.object({}),
  }),
  get_category_trend: tool({
    description: "Monthly spend in one category over the last N complete months, with the change.",
    inputSchema: z.object({ category: z.enum(CATEGORIES), months: z.number().nullable().optional().describe("2-12, default 6") }),
  }),
  run_projection: tool({
    description: "Project what happens to surplus and goal dates under hypothetical assumptions, without saving anything.",
    inputSchema: z.object({ assumptions: z.array(rawAssumption) }),
  }),
  create_scenario: tool({
    description: "Draft a named scenario from assumptions for the user to approve. It is NOT applied until the user approves.",
    inputSchema: z.object({ name: z.string().describe("2-5 words"), assumptions: z.array(rawAssumption) }),
  }),
  create_goal: tool({
    description:
      "Draft a new savings goal for something the user wants to buy, and test it against their surplus (funded first). target_amount_rupees must be the price the USER stated in the question; if they gave no price, do not estimate one: call finish and ask for it.",
    inputSchema: z.object({
      name: z.string().describe("the item, e.g. iPhone 18"),
      target_amount_rupees: z.number().nullable().optional().describe("only the price the user wrote"),
      target_date: z.string().nullable().optional().describe("YYYY-MM-DD"),
      months: z.number().nullable().optional().describe("months from now, if the user said 'in N months'"),
    }),
  }),
  finish: tool({
    description:
      "Conclude the investigation. explanation: two or three sentences, words only, NO digits, amounts, percentages or dates (the user already sees every figure). proposal: the one concrete action, as scenario assumptions, or null.",
    inputSchema: z.object({
      explanation: z.string(),
      proposal: z.object({ name: z.string(), assumptions: z.array(rawAssumption) }).nullable().optional(),
    }),
  }),
};

export const INVESTIGATE_SYSTEM = `You are RIPPLE's investigation agent for an Indian user's personal finances. You answer a question by calling tools that run the user's own deterministic money engine. Plan a short chain: start broad (goals, profile), then narrow to the cause (trends, recurring payments, transactions), then test a fix with run_projection or create_scenario. Call exactly one tool per turn. You have at most 5 tool calls; finish as soon as you can explain the cause.
If the user wants to buy something that is not one of their goals ("I want an iPhone, how do I save for it in four months"), first call create_goal with the price they stated, then test feasibility against surplus (its result shows the monthly gap), then run_projection or create_scenario for a change that closes the gap. If they did not state a price, call create_goal without one; RIPPLE will ask them. Never estimate a price.
When you finish, propose ONE concrete action that follows from a step you ran (a change you projected, or a category or payment a step showed). Never propose something no step touched. Express it as scenario assumptions (for example cut a growing category by a percent, or remove a recurring payment by its recurring_id). Only use categories, recurring_ids and goal_ids that appear in tool results. Never invent amounts: prefer percent cuts or removing a payment.
Rules: never recommend specific funds, stocks or insurance. In the finish explanation write words only, no digits, amounts, percentages or dates: the user already sees every figure next to each step.`;

export interface InvestigateRequest {
  question: string;
  steps: { tool: string; args: Record<string, unknown>; data: Record<string, unknown> }[];
  mustConclude: boolean;
  context: { today: string; goals: { id: string; name: string }[] };
}

/**
 * mask() runs on every string leaf on its own (a bare payee such as "Sunita Mehta" is only recognised as a whole
 * value), and any name found that way is then scrubbed wherever else it appears, including the user's question.
 */
function maskDeep(v: unknown, names: Set<string>): unknown {
  if (typeof v === "string") {
    // category names are a fixed list, never a person ("Family Transfer" reads like a name to the heuristic)
    if ((CATEGORIES as readonly string[]).includes(v)) return v;
    const m = mask(v);
    if (m === "[NAME]" && v.trim() !== "[NAME]") names.add(v.trim());
    return m;
  }
  if (Array.isArray(v)) return v.map((x) => maskDeep(x, names));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, maskDeep(x, names)]));
  return v;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The exact text the model sees for one planning step. Masked; also returned to the client for "What the AI sees". */
export function buildInvestigatePrompt(body: InvestigateRequest): string {
  const names = new Set<string>();
  const steps = maskDeep(body.steps ?? [], names) as InvestigateRequest["steps"];
  const scrub = (s: string) => [...names].reduce((acc, n) => acc.replace(new RegExp(`\\b${escapeRe(n)}\\b`, "gi"), "[NAME]"), s);
  const goals = body.context?.goals ?? [];
  const transcript = steps.length
    ? steps.map((s, i) => `${i + 1}. ${s.tool}(${JSON.stringify(s.args)}) -> ${JSON.stringify(s.data)}`).join("\n")
    : "(no tools called yet)";
  return scrub(
    mask(
      [
        `Today: ${body.context?.today ?? ""}`,
        `Goals (goal_id: name): ${goals.map((g) => `${g.id}: ${g.name}`).join("; ")}`,
        `Question: "${mask(String(body.question ?? ""))}"`,
        `Tool results so far:\n${transcript}`,
        body.mustConclude ? "You have used all 5 tool calls. Call finish now with what you have." : `Tool calls left: ${Math.max(0, 5 - steps.length)}.`,
      ].join("\n"),
    ),
  );
}

export type PlanResult = { tool: string; args: Record<string, unknown>; model: keyof typeof MODELS } | null;

/** Tries the smart model, then the fast one (separate free-tier quota), then gives up so the client's fixed chain takes over. */
export async function planStep(opts: { system: string; prompt: string; mustConclude: boolean; timeoutMs?: number }): Promise<PlanResult> {
  if (!hasKey()) {
    recordCall("failed");
    return null;
  }
  for (const model of ["smart", "fast"] as const) {
    try {
      const res = await generateText({
        model: groq(MODELS[model]),
        system: opts.system,
        prompt: opts.prompt,
        tools: INVESTIGATE_TOOLS,
        toolChoice: opts.mustConclude ? { type: "tool", toolName: "finish" } : "required",
        providerOptions: { groq: { reasoningEffort: "low", parallelToolCalls: false } },
        temperature: 0,
        abortSignal: AbortSignal.timeout(opts.timeoutMs ?? 20000),
        maxRetries: model === "smart" ? 1 : 2,
      });
      const call = res.toolCalls[0];
      if (call) {
        recordCall(model === "smart" ? "ok" : "fallback");
        return { tool: call.toolName, args: (call.input ?? {}) as Record<string, unknown>, model };
      }
    } catch (e) {
      console.error(`[ai] investigate step failed (${model}):`, (e as Error).message.slice(0, 200));
    }
  }
  recordCall("failed");
  return null;
}
