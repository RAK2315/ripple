import type { Advice, Assumption, Category, Goal, Profile, Recurring, RecurringStatus, Transaction } from "../types";
import type { RawAssumption } from "../scenario-parse";
import { CATEGORIES } from "../../../contract/types";
import { formatINR, monthLabel, monthLabelLong } from "../format";
import { addMonths, daysInMonth, monthsBetween, ym } from "./dates";
import { completeMonthsBefore, project, type Baseline, type Projection } from "./projection";
import { convertRaw, describeAssumption } from "./scenario";

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
  "create_goal",
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
  /** the user's question: create_goal only accepts a price the user actually stated in it */
  question?: string;
  /** the user's own categories (e.g. "Stationery"), valid everywhere a built-in one is */
  categories?: string[];
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
  /** create_goal: the goal drafted for approval (not saved) */
  goal?: Goal;
  /** something only the user can supply (an unstated price): the chain asks instead of guessing */
  needsInput?: string;
  error?: boolean;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(+v) ? +v : undefined);
/** A category name from the fixed list or the user's own (ctx.categories), case-insensitive. */
const asCategory = (v: unknown, ctx?: InvestigateCtx): Category | undefined => {
  const s = str(v);
  const list: readonly string[] = [...CATEGORIES, ...(ctx?.categories ?? [])];
  return s ? (list.find((c) => c.toLowerCase() === s.toLowerCase()) as Category | undefined) : undefined;
};
const sum = (xs: Transaction[]) => xs.reduce((a, t) => a + t.amount, 0);
const merchantOf = (t: Transaction) => t.merchant_normalized ?? t.raw_description;
const goalMonth = (m: string | null) => (m ? monthLabelLong(m) : "not within 6 years");

function mainProjection(ctx: InvestigateCtx, extra: Assumption[] = []): Projection {
  return project(ctx.baseline, [...ctx.mainAssumptions, ...extra], ctx.goals, ctx.profile.current_balance, ctx.today, 24);
}

function queryTransactions(ctx: InvestigateCtx, args: Record<string, unknown>): ToolResult {
  const category = asCategory(args.category, ctx);
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
    finding:
      ctx.baseline.incomeSource === "none" && plan.income <= 0
        ? `Income not detected (no regular salary in ${ctx.baseline.historyMonths} month${ctx.baseline.historyMonths === 1 ? "" : "s"} of history; enter it on Goals & Profile); fixed ${formatINR(plan.fixed)}, variable ${formatINR(plan.variable)}.`
        : `Income ${formatINR(plan.income)}/month; fixed ${formatINR(plan.fixed)}, variable ${formatINR(plan.variable)}, leaving ${formatINR(plan.surplus)} surplus.`,
    ids: ctx.baseline.incomeIds,
    data: {
      monthly_income: ctx.baseline.incomeSource === "none" && plan.income <= 0 ? "not detected (too little history)" : formatINR(plan.income),
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
  const category = asCategory(args.category, ctx);
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
    // unnamed: name it after what it changes ("Dining down 50%"), never a generic label
    name: name.trim().slice(0, 60) || assumptions.map((a) => describeAssumption(a, ctx.goals)).join(", ").slice(0, 60) || "Investigation fix",
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
  const d = draftScenario(ctx, str(args.name) ?? "", args.assumptions as RawAssumption[]);
  if (!d) return { tool, args, finding: "No usable assumptions to project.", ids: [], data: { error: "no valid assumptions" }, error: true };
  const data = {
    assumptions: d.lines,
    surplus_before: formatINR(d.surplus_before),
    surplus_after: formatINR(d.surplus_after),
    goals: d.goals.map((g) => ({ name: g.name, before: goalMonth(g.before), after: goalMonth(g.after) })),
  };
  const finding =
    tool === "create_scenario" ? `Drafted "${d.name}" for your approval (not applied): ${draftSummary(d)}.` : `With ${d.lines.join("; ")}: ${draftSummary(d)}.`;
  return { tool, args, finding, ids: draftIds(ctx, d), data, draft: d };
}

// ---------- purchase intent ----------

/** Rupee amounts the user literally wrote ("₹1,40,000", "1.4 lakh", "140k", "rs 80000"). Model names (iPhone 18) and durations are not prices. */
export function statedAmounts(q: string): number[] {
  const out: number[] = [];
  const re = /(₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d+)?)\s*(lakhs|lakh|lac|l|thousand|k|crore|cr)?\b(?!\s*(?:months?|mo|years?|yrs?|weeks?|days?|%|percent))/gi;
  for (const m of q.matchAll(re)) {
    const at = (m.index ?? 0) + m[0].indexOf(m[2]);
    const prev = q.slice(Math.max(0, at - 1), at);
    if (!m[1] && /[A-Za-z0-9]/.test(prev)) continue; // part of a word or a model name ("iPhone18")
    const n = parseFloat(m[2].replace(/,/g, ""));
    const u = (m[3] ?? "").toLowerCase();
    const v = u === "k" || u === "thousand" ? n * 1e3 : u.startsWith("l") ? n * 1e5 : u.startsWith("c") ? n * 1e7 : n;
    if (m[1] || u || v >= 1000) out.push(Math.round(v));
  }
  return [...new Set(out)];
}

/** "in 4 months", "within a year", "in 2 years" → months, or null. */
export function statedMonths(q: string): number | null {
  const m = q.match(/\b(?:in|within|over|next)\s+(\d+|a|an|one|two|three|six)\s*(months?|years?|yrs?)\b/i);
  if (!m) return null;
  const words: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, six: 6 };
  const n = words[m[1].toLowerCase()] ?? +m[1];
  return /^y/i.test(m[2]) ? n * 12 : n;
}

export function isPurchaseIntent(q: string): boolean {
  return /\b(buy|purchase|save (up )?for|afford|want (a|an|to buy|to get)|get (a|an|myself)|planning (a|an|to buy))\b/i.test(q);
}

/** The item named in a purchase question ("I want an iPhone 18, how do I…" → "iPhone 18"). */
export function purchaseItem(q: string): string | null {
  const m = q.match(
    /\b(?:buy|purchase|save (?:up )?for|afford|want|get|planning)\s+(?:to buy\s+|to get\s+|myself\s+)?(?:(?:an|a|the)\s+)?([A-Za-z][\w .+-]{1,40}?)(?=\s*(?:[,.?!;]|\bin\b|\bwithin\b|\bby\b|\bfor\b|\bthat\b|\bwhich\b|\bhow\b|\bcosting\b|\bat\b|\bworth\b|$))/i,
  );
  const item = m?.[1]?.trim();
  return item && !/^(one|it|that|this|them|to)$/i.test(item) ? item : null;
}

function createGoal(ctx: InvestigateCtx, args: Record<string, unknown>): ToolResult {
  const q = ctx.question ?? "";
  const name = (str(args.name) ?? purchaseItem(q) ?? "New goal").slice(0, 40);
  const stated = statedAmounts(q);
  const proposed = num(args.target_amount_rupees);
  // the price must be one the user wrote; a model's own estimate is refused
  const price = proposed != null ? stated.find((x) => Math.abs(x - proposed) <= Math.max(1, x * 0.005)) : stated.length === 1 ? stated[0] : undefined;
  if (price == null) {
    return {
      tool: "create_goal",
      args,
      finding: `No price for ${name} in your question, so no goal was created: RIPPLE never guesses a price.`,
      ids: [],
      data: { error: "the user did not state a price; do not estimate one, finish and ask for it", stated_amounts: stated },
      needsInput: `What does ${name} cost? Tell me the price (for example "${name} costs ₹80,000") and I'll test it against your surplus.`,
      error: true,
    };
  }
  const months = num(args.months) ?? statedMonths(q);
  const argDate = str(args.target_date);
  const start = ym(ctx.today);
  const target = argDate && /^\d{4}-\d{2}-\d{2}$/.test(argDate) && argDate > ctx.today ? ym(argDate) : addMonths(start, Math.max(1, Math.round(months ?? 12)));
  const goal: Goal = {
    id: `goal_inv_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 30)}`,
    name,
    target_amount: Math.round(price * 100),
    target_date: `${target}-${String(daysInMonth(target)).padStart(2, "0")}`,
    priority: 1,
    allocated_so_far: 0,
  };
  // feasibility: funded first, ahead of the existing goals
  const goals = withGoal(ctx.goals, goal);
  const before = mainProjection(ctx);
  const after = project(ctx.baseline, ctx.mainAssumptions, goals, ctx.profile.current_balance, ctx.today, 24);
  const res = after.goals.find((g) => g.goal.id === goal.id)!;
  const n = Math.max(1, monthsBetween(start, target));
  const need = Math.ceil(goal.target_amount / n);
  const surplus = after.plan.surplus;
  const verdict = surplus >= need ? "your surplus covers it" : `short by ${formatINR(need - surplus)}/month`;
  const moved = before.goals
    .map((g) => ({ name: g.goal.name, b: g.projected, a: after.goals.find((x) => x.goal.id === g.goal.id)?.projected ?? null }))
    .filter((g) => g.b !== g.a);
  return {
    tool: "create_goal",
    args: { ...args, name },
    finding: `Drafted goal ${name}: ${formatINR(goal.target_amount)} by ${monthLabelLong(target)} needs ${formatINR(need)}/month for ${n} month${n === 1 ? "" : "s"} against a ${formatINR(surplus)} surplus, ${verdict}; funded first it lands ${res.projected ? monthLabelLong(res.projected) : "beyond six years"}${moved.length ? ` and moves ${moved.map((g) => `${g.name} ${goalMonth(g.b)} → ${goalMonth(g.a)}`).join(", ")}` : ""}.`,
    ids: ctx.baseline.incomeIds,
    data: {
      goal_id: goal.id,
      target: formatINR(goal.target_amount),
      by: monthLabelLong(target),
      needed_per_month: formatINR(need),
      surplus_per_month: formatINR(surplus),
      gap_per_month: formatINR(Math.max(0, need - surplus)),
      lands_if_funded_first: res.projected ? monthLabelLong(res.projected) : "not within six years",
      on_time: res.onTrack,
      other_goals_moved: moved.map((g) => ({ name: g.name, before: goalMonth(g.b), after: goalMonth(g.a) })),
    },
    goal,
  };
}

/** A drafted goal goes first; existing goals keep their order behind it. */
export function withGoal(goals: Goal[], goal: Goal): Goal[] {
  return [goal, ...goals.filter((g) => g.id !== goal.id).map((g) => ({ ...g, priority: g.priority + 1 }))];
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
      case "create_goal":
        return createGoal(ctx, args);
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

/**
 * The one action the chain proposes. It always comes from a step in this chain (`step`, 1-based) and never from
 * the pre-existing advice list. `goal` is set when the chain drafted a new goal; approving creates it too.
 */
export type Proposal =
  | { kind: "scenario"; draft: ScenarioDraft; ids: string[]; step: number; goal: Goal | null }
  | { kind: "goal"; goal: Goal; ids: string[]; step: number; finding: string };

export interface Investigation {
  steps: ToolResult[];
  explanation: string;
  proposal: Proposal | null;
  /** something only the user can answer (an unstated price); shown instead of a proposal */
  ask: string | null;
  /** true when the planner hit the cap and was forced to conclude */
  capped: boolean;
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

const improves = (d: ScenarioDraft) =>
  d.surplus_after > d.surplus_before || d.goals.some((g) => (g.after && (!g.before || g.after < g.before)) || false);

/** Which step touched what an assumption changes (its category or recurring payment), so a model proposal can cite it. */
function stepTouching(steps: ToolResult[], a: Assumption): number {
  const i = steps.findIndex((s) => {
    const blob = JSON.stringify({ args: s.args, data: s.data });
    if ("category" in a && (s.args.category === a.category || blob.includes(`"category":"${a.category}"`))) return true;
    if (a.kind === "remove_recurring" && a.recurring_id && blob.includes(a.recurring_id)) return true;
    return false;
  });
  return i;
}

/**
 * Derive the proposal from this chain only. Order: the model's concluding proposal if a step touched what it
 * changes; else the last scenario the chain drafted or projected that helps; else a goal it drafted. Nothing
 * actionable → null, and the explanation says so.
 */
export function proposalFromChain(ctx: InvestigateCtx, steps: ToolResult[], modelProposal: { name: string; assumptions: RawAssumption[] } | null): Proposal | null {
  const goalStep = steps.map((s, i) => (s.goal ? i : -1)).filter((i) => i >= 0).pop() ?? -1;
  const goal = goalStep >= 0 ? steps[goalStep].goal! : null;
  const live = goal ? { ...ctx, goals: withGoal(ctx.goals, goal) } : ctx;

  if (modelProposal) {
    const d = draftScenario(live, modelProposal.name, modelProposal.assumptions);
    if (d && improves(d)) {
      const cited = d.assumptions.map((a) => stepTouching(steps, a)).filter((i) => i >= 0);
      if (cited.length) return { kind: "scenario", draft: d, ids: draftIds(live, d), step: Math.max(...cited) + 1, goal };
    }
  }
  for (let i = steps.length - 1; i >= 0; i--) {
    const d = steps[i].draft;
    if (d && improves(d)) return { kind: "scenario", draft: d, ids: steps[i].ids, step: i + 1, goal };
  }
  if (goal) return { kind: "goal", goal, ids: steps[goalStep].ids, step: goalStep + 1, finding: steps[goalStep].finding };
  return null;
}

/** Deterministic planner for when the model is unavailable: a fixed, question-aware chain over the same tools. */
export function fallbackPlanner(ctx: InvestigateCtx) {
  return async ({ question, steps, mustConclude }: PlannerInput): Promise<PlannerStep> => {
    const done = new Set(steps.map((s) => s.tool));
    const top = Object.entries(ctx.baseline.variableByCategory).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0] ?? "Dining";
    if (mustConclude) return { type: "conclude", explanation: null, proposal: null };
    if (isPurchaseIntent(question)) {
      // create the goal, test it against surplus, then model what closes the gap
      if (!done.has("create_goal")) return { type: "call", tool: "create_goal", args: { name: purchaseItem(question) ?? "New goal" } };
      if (steps.some((s) => s.needsInput)) return { type: "conclude", explanation: null, proposal: null };
      if (!done.has("get_category_trend")) return { type: "call", tool: "get_category_trend", args: { category: top, months: 6 } };
      if (!done.has("run_projection")) return { type: "call", tool: "run_projection", args: { assumptions: [{ kind: "category_pct", category: top, pct: -25 }] } };
      return { type: "conclude", explanation: null, proposal: null };
    }
    if (!done.has("get_goals")) return { type: "call", tool: "get_goals", args: {} };
    if (!done.has("get_profile")) return { type: "call", tool: "get_profile", args: {} };
    if (!done.has("get_category_trend")) return { type: "call", tool: "get_category_trend", args: { category: top, months: 6 } };
    if (!done.has("run_projection")) return { type: "call", tool: "run_projection", args: { assumptions: [{ kind: "category_pct", category: top, pct: -20 }] } };
    return { type: "conclude", explanation: null, proposal: null };
  };
}

/**
 * Run the plan → call → observe loop. The planner (model or fallback) chooses; runTool computes.
 * At most MAX_TOOL_CALLS tool calls; after that the planner is told to conclude, and if it still asks
 * for a tool the chain concludes anyway with what it has. A goal drafted mid-chain is part of every later step.
 */
export async function runInvestigation(
  ctx: InvestigateCtx,
  question: string,
  planner: (input: PlannerInput) => Promise<PlannerStep>,
  onStep?: (r: ToolResult) => void,
): Promise<Investigation> {
  const steps: ToolResult[] = [];
  let live: InvestigateCtx = { ...ctx, question };
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
      const r = runTool(live, next.tool, next.args ?? {});
      if (r.goal) live = { ...live, goals: withGoal(live.goals, r.goal) };
      steps.push(r);
      onStep?.(r);
    }
  }
  if (steps.length >= MAX_TOOL_CALLS) capped = true;

  const pending = steps.find((s) => s.needsInput);
  if (pending && !steps.some((s) => s.goal)) {
    return { steps, explanation: pending.needsInput!, proposal: null, ask: pending.needsInput!, capped };
  }
  const proposal = proposalFromChain(ctx, steps, conclusion.proposal);
  const explanation =
    cleanExplanation(conclusion.explanation) ??
    (proposal
      ? `The proposed action comes from step ${proposal.step} of the chain above; every figure in it is RIPPLE's own arithmetic.`
      : "The chain didn't find a change worth proposing. Each step above shows what it checked.");
  return { steps, explanation, proposal, ask: null, capped };
}
