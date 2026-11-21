import { describe, it, expect } from "vitest";
import fixture from "../../../../contract/fixture.json";
import type { Advice, Transaction } from "../../types";
import { categorizeAll } from "../categorize";
import { detectRecurring } from "../recurring";
import { computeBaseline } from "../projection";
import { DEMO_GOALS, DEMO_PROFILE } from "../../seed";
import {
  cleanExplanation,
  isPurchaseIntent,
  statedAmounts,
  statedMonths,
  fallbackPlanner,
  MAX_TOOL_CALLS,
  runInvestigation,
  runTool,
  TOOL_NAMES,
  type InvestigateCtx,
  type PlannerStep,
  type ToolResult,
} from "../investigate";
import { buildInvestigatePrompt } from "../../ai/investigate";

const T = "2026-11-20";
const txns = categorizeAll(fixture.transactions as Transaction[], [], {}, {});
const recurring = detectRecurring(txns, T);
const ctx: InvestigateCtx = {
  txns,
  recurring,
  baseline: computeBaseline(txns, recurring, DEMO_PROFILE, [], T),
  goals: DEMO_GOALS,
  profile: DEMO_PROFILE,
  mainAssumptions: [],
  advice: fixture.advice as Advice[],
  today: T,
};
const ids = new Set(txns.map((t) => t.id));

function contractShaped(r: ToolResult) {
  expect(TOOL_NAMES).toContain(r.tool);
  expect(typeof r.finding).toBe("string");
  expect(r.finding.length).toBeGreaterThan(0);
  expect(Array.isArray(r.ids)).toBe(true);
  // provenance: every row a tool reports touching is a real transaction id
  expect(r.ids.every((id) => ids.has(id))).toBe(true);
  expect(typeof r.data).toBe("object");
  // money reaches the model only as strings our formatter wrote, never as raw paise
  const money = JSON.stringify(r.data).match(/₹[\d,]+/g) ?? [];
  expect(money.every((m) => /^₹\d{1,3}(,\d{2})*(,\d{3})?$|^₹\d{1,3}$/.test(m) || /^₹[\d,]+$/.test(m))).toBe(true);
}

describe("investigation tools wrap the engine and return contract-shaped results", () => {
  it("query_transactions filters by category and reports engine totals", () => {
    const r = runTool(ctx, "query_transactions", { category: "Dining", date_from: "2026-08-01" });
    contractShaped(r);
    const rows = txns.filter((t) => t.direction === "debit" && t.category === "Dining" && t.date >= "2026-08-01");
    expect(r.ids.sort()).toEqual(rows.map((t) => t.id).sort());
    expect(r.data.count).toBe(rows.length);
  });

  it("get_recurring, get_goals, get_profile, get_category_trend all return findings with real ids", () => {
    for (const [tool, args] of [
      ["get_recurring", { status: "new" }],
      ["get_recurring", {}],
      ["get_goals", {}],
      ["get_profile", {}],
      ["get_category_trend", { category: "Dining", months: 6 }],
    ] as const) {
      const r = runTool(ctx, tool, args);
      contractShaped(r);
      expect(r.error).toBeFalsy();
    }
    const goals = runTool(ctx, "get_goals").data.goals as { name: string }[];
    expect(goals.map((g) => g.name)).toEqual(["Bike", "Laptop"]);
    expect((runTool(ctx, "get_category_trend", { category: "Dining", months: 6 }).data.monthly as unknown[]).length).toBe(6);
  });

  it("run_projection and create_scenario compute the delta with our engine; create_scenario only drafts", () => {
    const cut = { assumptions: [{ kind: "category_pct", category: "Dining", pct: -20 }] };
    const p = runTool(ctx, "run_projection", cut);
    contractShaped(p);
    const c = runTool(ctx, "create_scenario", { name: "Cut dining", ...cut });
    contractShaped(c);
    expect(c.draft!.surplus_after).toBeGreaterThan(c.draft!.surplus_before);
    expect(c.draft!.assumptions).toEqual([{ kind: "category_pct", category: "Dining", pct: -20 }]);
  });

  it("bad calls become error steps, never throws", () => {
    expect(runTool(ctx, "delete_everything", {}).error).toBe(true);
    expect(runTool(ctx, "get_category_trend", { category: "Bitcoin" }).error).toBe(true);
    expect(runTool(ctx, "run_projection", { assumptions: "nonsense" }).error).toBe(true);
    const empty = runTool(ctx, "query_transactions", { merchant: "no such merchant zzz" });
    expect(empty.ids).toEqual([]);
    expect(empty.data.count).toBe(0);
  });

  it("the model's explanation never carries a figure", () => {
    expect(cleanExplanation("Dining is growing fastest. You spent ₹6,800 last month. Cutting it brings the bike closer.")).toBe(
      "Dining is growing fastest. Cutting it brings the bike closer.",
    );
    expect(cleanExplanation("It went up 40%.")).toBeNull();
  });
});

describe("privacy: the investigation prompt", () => {
  it("masks payee names, phone numbers and UPI handles from tool results and the question", () => {
    const steps = (["get_recurring", "get_profile"] as const).map((t) => runTool(ctx, t, {}));
    const items = steps[0].data.items as { merchant: string; category: string }[];
    // the fixture pays rent and a family transfer to people; the tool reports them by name on the user's screen
    const payees = ["Ramesh Kulkarni", "Sunita Mehta"];
    for (const p of payees) expect(items.map((i) => i.merchant)).toContain(p);
    steps[0].data.items = [...items, { merchant: "x", category: "Family Transfer" }];
    const prompt = buildInvestigatePrompt({
      question: `Why do I pay ${payees[0]} so much? My number is 9876543210, UPI ramesh.k@okicici`,
      steps: steps.map((s) => ({ tool: s.tool, args: s.args, data: s.data })),
      mustConclude: false,
      context: { today: T, goals: DEMO_GOALS.map((g) => ({ id: g.id, name: g.name })) },
    });
    for (const p of payees) expect(prompt).not.toContain(p);
    expect(prompt).not.toContain("9876543210");
    expect(prompt).not.toContain("ramesh.k@");
    expect(prompt).toContain("[NAME]");
    expect(prompt).toContain("Country Delight"); // merchants and categories stay: the model needs them
    expect(prompt).toContain("Family Transfer");
  });
});

describe("the chain", () => {
  it("terminates at the five-call cap even if the planner never stops", async () => {
    let calls = 0;
    const greedy = async (): Promise<PlannerStep> => {
      calls++;
      return { type: "call", tool: "get_profile", args: {} };
    };
    const seen: ToolResult[] = [];
    const out = await runInvestigation(ctx, "why?", greedy, (r) => seen.push(r));
    expect(out.steps).toHaveLength(MAX_TOOL_CALLS);
    expect(seen).toHaveLength(MAX_TOOL_CALLS);
    expect(out.capped).toBe(true);
    expect(calls).toBe(MAX_TOOL_CALLS + 1); // the sixth ask is told to conclude, and is overruled
    expect(out.proposal).toBeNull(); // five reads found nothing to act on, and nothing unrelated is substituted
  });

  it("tells the planner to conclude at the cap and uses its proposal, priced by our engine", async () => {
    const flags: boolean[] = [];
    const planner = async ({ mustConclude }: { mustConclude: boolean }): Promise<PlannerStep> => {
      flags.push(mustConclude);
      return mustConclude
        ? { type: "conclude", explanation: "Dining keeps growing.", proposal: { name: "Trim dining", assumptions: [{ kind: "category_pct", category: "Dining", pct: -25 }] } }
        : { type: "call", tool: "get_category_trend", args: { category: "Dining" } };
    };
    const out = await runInvestigation(ctx, "bike?", planner);
    expect(flags).toEqual([false, false, false, false, false, true]);
    expect(out.proposal?.kind).toBe("scenario");
    if (out.proposal?.kind === "scenario") expect(out.proposal.draft.surplus_after).toBeGreaterThan(out.proposal.draft.surplus_before);
  });

  it("a planner that throws still yields an answer; the fallback chain stays under the cap", async () => {
    const broken = await runInvestigation(ctx, "?", async () => {
      throw new Error("down");
    });
    expect(broken.steps).toHaveLength(0);
    expect(broken.explanation.length).toBeGreaterThan(0);
    const fb = await runInvestigation(ctx, "Why am I falling behind on the bike goal?", fallbackPlanner(ctx));
    expect(fb.steps.length).toBeLessThanOrEqual(MAX_TOOL_CALLS);
    expect(fb.steps.map((s) => s.tool)).toEqual(["get_goals", "get_profile", "get_category_trend", "run_projection"]);
    expect(fb.proposal?.kind).toBe("scenario");
  });

  it("a purchase-intent question creates the goal, tests it against surplus, then models what closes the gap", async () => {
    const q = "I want an iPhone 18 for ₹1,40,000, how do I save for one in 4 months?";
    const out = await runInvestigation(ctx, q, fallbackPlanner(ctx));
    expect(out.steps[0].tool).toBe("create_goal");
    const goal = out.steps[0].goal!;
    expect(goal.name).toBe("iPhone 18");
    expect(goal.target_amount).toBe(14000000);
    expect(goal.target_date).toBe("2027-03-31");
    expect(out.steps[0].data.needed_per_month).toBe("₹35,000");
    expect(out.steps[0].finding).toMatch(/short by|covers it/);
    // later steps run with the drafted goal in place
    const proj = out.steps.find((s) => s.tool === "run_projection")!;
    expect(proj.draft!.goals.map((g) => g.name)).toContain("iPhone 18");
    expect(out.proposal).not.toBeNull();
    expect(out.proposal!.kind === "scenario" ? out.proposal!.goal?.name : out.proposal!.goal.name).toBe("iPhone 18");
  });

  it("asks for the price instead of inventing one; a model's own price is refused", async () => {
    const out = await runInvestigation(ctx, "I want an iPhone 18, how do I save for one in 4 months?", fallbackPlanner(ctx));
    expect(out.steps.map((s) => s.tool)).toEqual(["create_goal"]);
    expect(out.steps[0].goal).toBeUndefined();
    expect(out.ask).toMatch(/What does iPhone 18 cost/);
    expect(out.proposal).toBeNull();
    const invented = runTool({ ...ctx, question: "I want an iPhone 18 in 4 months" }, "create_goal", { name: "iPhone 18", target_amount_rupees: 139900 });
    expect(invented.goal).toBeUndefined();
    expect(invented.needsInput).toBeTruthy();
  });

  it("the proposed action references a step from the chain that produced it, never the advice list", async () => {
    for (const q of ["Why am I falling behind on the bike goal?", "What is eating into my surplus?"]) {
      const out = await runInvestigation(ctx, q, fallbackPlanner(ctx));
      const p = out.proposal!;
      expect(p.step).toBeGreaterThanOrEqual(1);
      const cited = out.steps[p.step - 1];
      expect(["run_projection", "create_scenario", "create_goal"]).toContain(cited.tool);
      if (p.kind === "scenario") expect(cited.draft).toEqual(p.draft);
    }
    // a model proposal about something no step touched is not used
    const planner = async ({ steps }: { steps: ToolResult[] }): Promise<PlannerStep> =>
      steps.length < 2
        ? { type: "call", tool: steps.length ? "get_category_trend" : "get_goals", args: { category: "Shopping" } }
        : { type: "conclude", explanation: "Shopping is up.", proposal: { name: "Trim travel", assumptions: [{ kind: "category_pct", category: "Travel", pct: -50 }] } };
    const out = await runInvestigation(ctx, "why?", planner);
    expect(out.proposal).toBeNull(); // nothing actionable found: no unrelated substitute
    expect(out.explanation).toMatch(/Shopping is up|didn't find a change/);
    const ok = async ({ steps }: { steps: ToolResult[] }): Promise<PlannerStep> =>
      steps.length < 1
        ? { type: "call", tool: "get_category_trend", args: { category: "Dining" } }
        : { type: "conclude", explanation: null, proposal: { name: "Trim dining", assumptions: [{ kind: "category_pct", category: "Dining", pct: -30 }] } };
    const good = await runInvestigation(ctx, "why?", ok);
    expect(good.proposal?.kind).toBe("scenario");
    expect(good.proposal?.step).toBe(1);
    // cites the step that looked at Dining, not one whose results merely list it (seen live: get_profile was cited)
    const two = async ({ steps }: { steps: ToolResult[] }): Promise<PlannerStep> =>
      steps.length === 0
        ? { type: "call", tool: "get_profile", args: {} }
        : steps.length === 1
          ? { type: "call", tool: "get_category_trend", args: { category: "Dining" } }
          : { type: "conclude", explanation: null, proposal: { name: "Trim dining", assumptions: [{ kind: "category_pct", category: "Dining", pct: -30 }] } };
    expect((await runInvestigation(ctx, "why?", two)).proposal?.step).toBe(2);
  });

  it("stated prices and durations are read by our code, model names are not prices", () => {
    expect(statedAmounts("iPhone 18 for ₹1,40,000 in 4 months")).toEqual([140000]);
    expect(statedAmounts("a bike worth 1.25 lakh")).toEqual([125000]);
    expect(statedAmounts("PS5 at 55k")).toEqual([55000]);
    expect(statedAmounts("I want an iPhone 18 in 4 months")).toEqual([]);
    expect(statedMonths("in 4 months")).toBe(4);
    expect(statedMonths("within a year")).toBe(12);
    expect(isPurchaseIntent("how do I save for a PS5")).toBe(true);
    expect(isPurchaseIntent("why is dining up")).toBe(false);
  });

  it("an empty dataset never crashes any tool", async () => {
    const bare: InvestigateCtx = { ...ctx, txns: [], recurring: [], baseline: computeBaseline([], [], DEMO_PROFILE, [], T), advice: [] };
    for (const t of TOOL_NAMES) expect(() => runTool(bare, t, { category: "Dining", assumptions: [] })).not.toThrow();
    const out = await runInvestigation(bare, "?", fallbackPlanner(bare));
    expect(out.proposal).toBeNull();
  });
});
