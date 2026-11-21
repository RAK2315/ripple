import type { Advice, Assumption, Category, Goal, Profile, Recurring, RecurringStatus, Transaction } from "../types";
import type { RawAssumption } from "../scenario-parse";
import { CATEGORIES } from "../../../contract/types";
import { formatINR, monthLabel } from "../format";
import { ym } from "./dates";
import { completeMonthsBefore, project, type Baseline, type Projection } from "./projection";
import { convertRaw, describeAssumption } from "./scenario";
import { adviceId, findOpportunities, freshOpportunities } from "./opportunities";

/**
 * Investigation agent, tool layer. The model plans and chooses which tool to call; every tool here is a thin wrapper
 * over an existing engine function, and every rupee figure in a result (finding, data) is computed by this file.
 * Pure: no React, no fetch, no store.
 */

export const MAX_TOOL_CALLS = 5;

export const TOOL_NAMES = [
  "query_transactions",
  "get_recurring",
  "get_goals",
  "get_profile",
  "get_category_trend",
  "run_projection",
  "create_scenario",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export interface InvestigateCtx {
  /** categorized transactions */
  txns: Transaction[];
  recurring: Recurring[];
  baseline: Baseline;
  goals: Goal[];
  profile: Profile;
  /** the main scenario's assumption chain (chainAssumptions(scenarios, "main")) */
  mainAssumptions: Assumption[];
  advice: Advice[];
  today: string;
}

export interface ScenarioDraft {
  name: string;
  assumptions: Assumption[];
  lines: string[];
  surplus_before: number;
  surplus_after: number;
  goals: { name: string; before: string | null; after: string | null }[];
}

export interface ToolResult {
  tool: ToolName;
  args: Record<string, unknown>;
  /** one line of plain English, written by our code with our figures */
  finding: string;
  /** the transaction rows this step touched (provenance) */
  ids: string[];
  /** compact facts sent (masked) back to the model; money already formatted by our code */
  data: Record<string, unknown>;
  draft?: ScenarioDraft;
  error?: boolean;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(+v) ? +v : undefined);
const asCategory = (v: unknown): Category | undefined => {
  const s = str(v);
  return s ? (CATEGORIES as readonly string[]).find((c) => c.toLowerCase() === s.toLowerCase()) as Category | undefined : undefined;
};
const sum = (xs: Transaction[]) => xs.reduce((a, t) => a + t.amount, 0);
const merchantOf = (t: Transaction) => t.merchant_normalized ?? t.raw_description;
const goalMonth = (m: string | null) => (m ? monthLabel(m) : "not within 6 years");

function mainProjection(ctx: InvestigateCtx, extra: Assumption[] = []): Projection {
  return project(ctx.baseline, [...ctx.mainAssumptions, ...extra], ctx.goals, ctx.profile.current_balance, ctx.today, 24);
}

function queryTransactions(ctx: InvestigateCtx, args: Record<string, unknown>): ToolResult {
  const category = asCategory(args.category);
  const merchant = str(args.merchant)?.toLowerCase();
  const from = str(args.date_from);
  const to = str(args.date_to);
  const min = num(args.min_amount_rupees);
  const direction = args.direction === "credit" || category === "Income" ? "credit" : "debit";
  const rows = ctx.txns.filter(
    (t) =>
      t.direction === direction &&
      (!category || t.category === category) &&
      (!merchant || merchantOf(t).toLowerCase().includes(merchant) || t.raw_description.toLowerCase().includes(merchant)) &&
      (!from || t.date >= from) &&
      (!to || t.date <= to) &&
      (min == null || t.amount >= Math.round(min * 100)),
  );
  const what = [category, merchant ? `at "${str(args.merchant)}"` : null].filter(Boolean).join(" ") || "matching";
  if (!rows.length) return { tool: "query_transactions", args, finding: `No ${what} transactions found.`, ids: [], data: { count: 0 } };
  const byMerchant = new Map<string, Transaction[]>();
  for (const t of rows) byMerchant.set(merchantOf(t), [...(byMerchant.get(merchantOf(t)) ?? []), t]);
  const top = [...byMerchant.entries()].map(([m, ts]) => ({ m, total: sum(ts), n: ts.length })).sort((a, b) => b.total - a.total);
  const byMonth = new Map<string, number>();
  for (const t of rows) byMonth.set(ym(t.date), (byMonth.get(ym(t.date)) ?? 0) + t.amount);
  const span = `${monthLabel(ym(rows[0].date))}–${monthLabel(ym(rows[rows.length - 1].date))}`;
  return {
    tool: "query_transactions",
    args,
    finding: `${rows.length} ${what} transactions (${span}) totalling ${formatINR(sum(rows))}; biggest: ${top[0].m} at ${formatINR(top[0].total)}.`,
    ids: rows.map((t) => t.id),
    data: {
      count: rows.length,
      total: formatINR(sum(rows)),
      by_month: Object.fromEntries([...byMonth.entries()].sort().map(([m, v]) => [m, formatINR(v)])),
      top_merchants: top.slice(0, 5).map((x) => ({ merchant: x.m, total: formatINR(x.total), count: x.n })),
    },
  };
}

function getRecurring(ctx: InvestigateCtx, args: Record<string, unknown>): ToolResult {
  const status = (["active", "changed", "unused", "new"] as RecurringStatus[]).find((s) => s === args.status);
  const list = ctx.recurring.filter((r) => r.direction === "debit" && (!status || r.status === status));
  const monthly = list.reduce((a, r) => a + r.monthly_amount, 0);
  const label = status ? `${status} recurring payments` : "recurring payments";
  return {
    tool: "get_recurring",
    args,
    finding: list.length
      ? `${list.length} ${label} costing ${formatINR(monthly)} a month: ${list.slice(0, 4).map((r) => r.merchant_normalized).join(", ")}${list.length > 4 ? "…" : ""}.`
      : `No ${label}.`,
    ids: list.flatMap((r) => r.transaction_ids),
    data: {
      total_monthly: formatINR(monthly),
      items: list.map((r) => ({
        recurring_id: r.id,
        merchant: r.merchant_normalized,
        category: r.category,
        monthly: formatINR(r.monthly_amount),
        status: r.status,
        ...(r.previous_amount != null ? { previous: formatINR(r.previous_amount), changed_on: r.changed_on } : {}),
        first_seen: r.first_seen,
      })),
    },
  };
}

function getGoals(ctx: InvestigateCtx): ToolResult {
  const p = mainProjection(ctx);
  const goals = p.goals.map((g) => ({
    goal_id: g.goal.id,
    name: g.goal.name,
    target: formatINR(g.goal.target_amount),
    target_month: monthLabel(ym(g.goal.target_date)),
    saved_so_far: formatINR(g.goal.allocated_so_far),
    projected_month: goalMonth(g.projected),
    on_track: g.onTrack,
    months_late: g.projected ? g.monthsLate : null,
  }));
  return {
    tool: "get_goals",
    args: {},
    finding: goals.length
      ? goals.map((g) => `${g.name}: due ${g.target_month}, projected ${g.projected_month}${g.on_track ? " (on track)" : g.months_late ? ` (${g.months_late} mo late)` : ""}`).join("; ") + "."
      : "No goals set.",
    ids: [],
    data: { goals, monthly_surplus_funding_goals: formatINR(p.plan.surplus) },
  };
}

function getProfile(ctx: InvestigateCtx): ToolResult {
  const plan = mainProjection(ctx).plan;
  const topVar = Object.entries(plan.variableByCategory)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .slice(0, 4)
    .map(([c, v]) => ({ category: c, monthly: formatINR(v ?? 0) }));
  return {
    tool: "get_profile",
    args: {},
    finding: `Income ${formatINR(plan.income)}/month; fixed ${formatINR(plan.fixed)}, variable ${formatINR(plan.variable)}, leaving ${formatINR(plan.surplus)} surplus.`,
    ids: ctx.baseline.incomeIds,
    data: {
      monthly_income: formatINR(plan.income),
      fixed_monthly: formatINR(plan.fixed),
      variable_monthly: formatINR(plan.variable),
      surplus_monthly: formatINR(plan.surplus),
      balance_today: formatINR(ctx.profile.current_balance),
      emergency_fund: `${formatINR(ctx.profile.emergency_fund_current)} of ${formatINR(ctx.profile.emergency_fund_target)}`,
      top_variable_categories: topVar,
    },
  };
}

function getCategoryTrend(ctx: InvestigateCtx, args: Record<string, unknown>): ToolResult {
  const category = asCategory(args.category);
  if (!category) return { tool: "get_category_trend", args, finding: `Unknown category "${String(args.category ?? "")}".`, ids: [], data: { error: "unknown category", categories: CATEGORIES }, error: true };
  const n = Math.min(12, Math.max(2, Math.round(num(args.months) ?? 6)));
  const months = completeMonthsBefore(ctx.today, ctx.txns, n);
  const rows = ctx.txns.filter((t) => t.direction === "debit" && t.category === category && months.includes(ym(t.date)));
  const series = months.map((m) => ({ month: m, total: sum(rows.filter((t) => ym(t.date) === m)) }));
  const first = series[0]?.total ?? 0;
  const last = series[series.length - 1]?.total ?? 0;
  const pct = first > 0 ? Math.round(((last - first) / first) * 100) : null;
  const finding = series.length
    ? `${category} went from ${formatINR(first)} in ${monthLabel(series[0].month)} to ${formatINR(last)} in ${monthLabel(series[series.length - 1].month)}${pct != null ? ` (${pct >= 0 ? "+" : ""}${pct}%)` : ""}.`
    : `No complete months of ${category} data.`;
  return {
    tool: "get_category_trend",
    args: { category, months: n },
    finding,
    ids: rows.map((t) => t.id),
    data: { category, monthly: series.map((s) => ({ month: s.month, total: formatINR(s.total) })), change_pct: pct },
  };
}

/** Wraps convertRaw + project: the model's assumptions are parameters; the arithmetic is ours. */
export function draftScenario(ctx: InvestigateCtx, name: string, raw: RawAssumption[]): ScenarioDraft | null {
  const assumptions = convertRaw(Array.isArray(raw) ? raw : [], { recurring: ctx.recurring, income: ctx.baseline.income, today: ctx.today });
  if (!assumptions.length) return null;
  return draftFromAssumptions(ctx, name, assumptions);
}

export function draftFromAssumptions(ctx: InvestigateCtx, name: string, assumptions: Assumption[]): ScenarioDraft {
  const before = mainProjection(ctx);
  const after = mainProjection(ctx, assumptions);
  return {
    name: name.trim().slice(0, 60) || "Investigation fix",
    assumptions,
    lines: assumptions.map((a) => describeAssumption(a, ctx.goals)),
    surplus_before: before.plan.surplus,
    surplus_after: after.plan.surplus,
    goals: before.goals.map((g) => ({ name: g.goal.name, before: g.projected, after: after.goals.find((x) => x.goal.id === g.goal.id)?.projected ?? null })),
  };
}

function draftIds(ctx: InvestigateCtx, d: ScenarioDraft): string[] {
  const ids: string[] = [];
  for (const a of d.assumptions) {
    if ("category" in a) ids.push(...(ctx.baseline.variableIds[a.category] ?? []));
    if (a.kind === "remove_recurring") ids.push(...(ctx.recurring.find((r) => r.id === a.recurring_id)?.transaction_ids ?? []));
    if (a.kind === "income_change") ids.push(...ctx.baseline.incomeIds);
  }
  return [...new Set(ids)];
}

export function draftSummary(d: ScenarioDraft): string {
  const moved = d.goals.filter((g) => g.before !== g.after).map((g) => `${g.name} ${goalMonth(g.before)} → ${goalMonth(g.after)}`);
  return `surplus ${formatINR(d.surplus_before)} → ${formatINR(d.surplus_after)}${moved.length ? `; ${moved.join(", ")}` : "; goal dates unchanged"}`;
}

function projectionTool(ctx: InvestigateCtx, tool: "run_projection" | "create_scenario", args: Record<string, unknown>): ToolResult {
  const name = str(args.name) ?? "What-if";
  const d = draftScenario(ctx, name, args.assumptions as RawAssumption[]);
  if (!d) return { tool, args, finding: "No usable assumptions to project.", ids: [], data: { error: "no valid assumptions" }, error: true };
  const data = {
    assumptions: d.lines,
    surplus_before: formatINR(d.surplus_before),
    surplus_after: formatINR(d.surplus_after),
    goals: d.goals.map((g) => ({ name: g.name, before: goalMonth(g.before), after: goalMonth(g.after) })),
  };
  const finding =
    tool === "create_scenario" ? `Drafted "${d.name}" for your approval (not applied): ${draftSummary(d)}.` : `With ${d.lines.join("; ")}: ${draftSummary(d)}.`;
  return { tool, args, finding, ids: draftIds(ctx, d), data, ...(tool === "create_scenario" ? { draft: d } : {}) };
}

/** Dispatch one tool call. Never throws: a bad call becomes an error step the model can read. */
export function runTool(ctx: InvestigateCtx, tool: string, args: Record<string, unknown> = {}): ToolResult {
  try {
    switch (tool as ToolName) {
      case "query_transactions":
        return queryTransactions(ctx, args);
      case "get_recurring":
        return getRecurring(ctx, args);
      case "get_goals":
        return getGoals(ctx);
      case "get_profile":
        return getProfile(ctx);
      case "get_category_trend":
        return getCategoryTrend(ctx, args);
      case "run_projection":
      case "create_scenario":
        return projectionTool(ctx, tool as "run_projection" | "create_scenario", args);
    }
  } catch (e) {
    return { tool: tool as ToolName, args, finding: `Tool failed: ${(e as Error).message}`, ids: [], data: { error: "tool failed" }, error: true };
  }
  return { tool: tool as ToolName, args, finding: `Unknown tool "${tool}".`, ids: [], data: { error: "unknown tool", tools: TOOL_NAMES }, error: true };
}

// ---------- the chain ----------

export type PlannerStep =
  | { type: "call"; tool: string; args: Record<string, unknown> }
  | { type: "conclude"; explanation: string | null; proposal: { name: string; assumptions: RawAssumption[] } | null };

export interface PlannerInput {
  question: string;
  steps: ToolResult[];
  /** true once the cap is reached: the planner must conclude with what it has */
  mustConclude: boolean;
}

export type Proposal =
  | { kind: "scenario"; draft: ScenarioDraft; ids: string[] }
  | { kind: "advice"; advice: Advice; evidence: string[]; label: string; monthly_saving: number };

export interface Investigation {
  steps: ToolResult[];
  explanation: string;
  proposal: Proposal | null;
  /** true when the planner hit the cap and was forced to conclude */
  capped: boolean;
}

/** The fallback proposal when the model offers none: the top fresh savings opportunity our engine priced, as advice. */
export function fallbackProposal(ctx: InvestigateCtx): Proposal | null {
  const o = freshOpportunities(findOpportunities(ctx.txns, ctx.recurring, ctx.today), ctx.advice)[0];
  if (!o) return null;
  const text = `${o.action}. This saves about ${formatINR(o.monthly_saving)} a month (found by the investigation agent).`;
  return {
    kind: "advice",
    advice: { id: adviceId(o), date_given: ctx.today, text, projected_monthly_saving: o.monthly_saving, accepted: false, acted_on_date: null },
    evidence: o.evidence_ids,
    label: o.action,
    monthly_saving: o.monthly_saving,
  };
}

/** Words only: any sentence carrying a digit or rupee sign is dropped, so the model never states a figure. */
export function cleanExplanation(text: string | null | undefined): string | null {
  if (!text) return null;
  const kept = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim() && !/[\d₹]/.test(s));
  const out = kept.join(" ").trim();
  return out.length >= 12 ? out.slice(0, 600) : null;
}

/** Deterministic planner for when the model is unavailable: a fixed, question-aware chain over the same tools. */
export function fallbackPlanner(ctx: InvestigateCtx) {
  return async ({ steps, mustConclude }: PlannerInput): Promise<PlannerStep> => {
    const done = new Set(steps.map((s) => s.tool));
    if (!mustConclude) {
      if (!done.has("get_goals")) return { type: "call", tool: "get_goals", args: {} };
      if (!done.has("get_profile")) return { type: "call", tool: "get_profile", args: {} };
      if (!done.has("get_recurring")) return { type: "call", tool: "get_recurring", args: { status: "new" } };
      if (!done.has("get_category_trend")) {
        const top = Object.entries(ctx.baseline.variableByCategory).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0] ?? "Dining";
        return { type: "call", tool: "get_category_trend", args: { category: top, months: 6 } };
      }
    }
    return { type: "conclude", explanation: null, proposal: null };
  };
}

const TEMPLATE_EXPLANATION = "Here is what the chain found, step by step. The proposed action below is priced by RIPPLE's own arithmetic.";

/**
 * Run the plan → call → observe loop. The planner (model or fallback) chooses; runTool computes.
 * At most MAX_TOOL_CALLS tool calls; after that the planner is told to conclude, and if it still asks
 * for a tool the chain concludes anyway with what it has.
 */
export async function runInvestigation(
  ctx: InvestigateCtx,
  question: string,
  planner: (input: PlannerInput) => Promise<PlannerStep>,
  onStep?: (r: ToolResult) => void,
): Promise<Investigation> {
  const steps: ToolResult[] = [];
  let conclusion: Extract<PlannerStep, { type: "conclude" }> | null = null;
  let capped = false;
  while (!conclusion) {
    const mustConclude = steps.length >= MAX_TOOL_CALLS;
    let next: PlannerStep;
    try {
      next = await planner({ question, steps: [...steps], mustConclude });
    } catch {
      next = { type: "conclude", explanation: null, proposal: null };
    }
    if (next.type === "conclude") conclusion = next;
    else if (mustConclude) {
      capped = true;
      conclusion = { type: "conclude", explanation: null, proposal: null };
    } else {
      const r = runTool(ctx, next.tool, next.args ?? {});
      steps.push(r);
      onStep?.(r);
    }
  }
  if (steps.length >= MAX_TOOL_CALLS) capped = true;

  let proposal: Proposal | null = null;
  const fromModel = conclusion.proposal ? draftScenario(ctx, conclusion.proposal.name, conclusion.proposal.assumptions) : null;
  const drafted = fromModel ?? [...steps].reverse().find((s) => s.draft)?.draft ?? null;
  if (drafted && drafted.surplus_after !== drafted.surplus_before) proposal = { kind: "scenario", draft: drafted, ids: draftIds(ctx, drafted) };
  else proposal = fallbackProposal(ctx);

  return { steps, explanation: cleanExplanation(conclusion.explanation) ?? TEMPLATE_EXPLANATION, proposal, capped };
}
