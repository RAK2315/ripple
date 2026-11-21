import type { Assumption, Category, FixedCost, Goal, Profile, Recurring, Transaction } from "../types";
import { addMonths, ym } from "./dates";

/** All money in paise. Pure arithmetic, no model involvement anywhere in this file. */

export interface Baseline {
  income: number;
  incomeIds: string[];
  /** monthly fixed by category (recurring debits + manual fixed costs) */
  fixedByCategory: Partial<Record<Category, number>>;
  /** trailing 3 complete-month average of non-recurring debits, per category */
  variableByCategory: Partial<Record<Category, number>>;
  variableIds: Partial<Record<Category, string[]>>;
  /** std dev of total monthly variable spend over last 6 complete months */
  variableSigma: number;
  completeMonths: string[];
  /** where income came from: the user's own figure, a detected salary, or nothing (too little history) */
  incomeSource: "profile" | "detected" | "none";
  /** distinct calendar months in the imported history */
  historyMonths: number;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function completeMonthsBefore(today: string, txns: Transaction[], n: number): string[] {
  const cur = ym(today);
  const all = [...new Set(txns.map((t) => ym(t.date)))].filter((m) => m < cur).sort();
  return all.slice(-n);
}

export function computeBaseline(
  txns: Transaction[],
  recurring: Recurring[],
  profile: Profile,
  manualFixed: FixedCost[],
  today: string,
): Baseline {
  const recurringIds = new Set(recurring.flatMap((r) => r.transaction_ids));
  const salary = recurring.filter((r) => r.direction === "credit").sort((a, b) => b.monthly_amount - a.monthly_amount)[0];
  const income = profile.monthly_income ?? salary?.monthly_amount ?? 0;

  const fixedByCategory: Partial<Record<Category, number>> = {};
  for (const r of recurring) {
    if (r.direction !== "debit") continue;
    fixedByCategory[r.category] = (fixedByCategory[r.category] ?? 0) + r.monthly_amount;
  }
  for (const f of manualFixed) {
    if (f.linked_recurring_id) continue;
    fixedByCategory.Other = (fixedByCategory.Other ?? 0) + f.amount;
  }

  const last3 = completeMonthsBefore(today, txns, 3);
  const last6 = completeMonthsBefore(today, txns, 6);
  const variable = txns.filter((t) => t.direction === "debit" && !recurringIds.has(t.id) && t.category);
  const variableByCategory: Partial<Record<Category, number>> = {};
  const variableIds: Partial<Record<Category, string[]>> = {};
  for (const t of variable) {
    if (!last3.includes(ym(t.date))) continue;
    const c = t.category!;
    variableByCategory[c] = (variableByCategory[c] ?? 0) + t.amount;
    (variableIds[c] ??= []).push(t.id);
  }
  for (const c of Object.keys(variableByCategory) as Category[]) {
    variableByCategory[c] = Math.round(variableByCategory[c]! / Math.max(1, last3.length));
  }
  const monthlyTotals = last6.map((m) => sum(variable.filter((t) => ym(t.date) === m).map((t) => t.amount)));
  const mean = sum(monthlyTotals) / Math.max(1, monthlyTotals.length);
  const variableSigma = Math.round(Math.sqrt(sum(monthlyTotals.map((x) => (x - mean) ** 2)) / Math.max(1, monthlyTotals.length)));

  return {
    income,
    incomeIds: salary?.transaction_ids ?? [],
    fixedByCategory,
    variableByCategory,
    variableIds,
    variableSigma,
    completeMonths: last6,
    incomeSource: profile.monthly_income != null ? "profile" : salary ? "detected" : "none",
    historyMonths: new Set(txns.map((t) => ym(t.date))).size,
  };
}

export interface MonthPlan {
  income: number;
  fixed: number;
  variable: number;
  byCategory: Partial<Record<Category, number>>;
  fixedByCategory: Partial<Record<Category, number>>;
  variableByCategory: Partial<Record<Category, number>>;
  /** add_recurring - remove_recurring, monthly */
  extraFixed: number;
  surplus: number;
}

/** Apply scenario assumptions to the baseline, producing the recurring monthly plan. */
export function applyAssumptions(base: Baseline, assumptions: Assumption[]): MonthPlan {
  let income = base.income;
  const fixed = { ...base.fixedByCategory };
  const variable = { ...base.variableByCategory };
  let extraFixed = 0;
  for (const a of assumptions) {
    if (a.kind === "income_change") income += a.amount;
    if (a.kind === "add_recurring") extraFixed += a.amount;
    if (a.kind === "remove_recurring") extraFixed -= a.amount;
    if (a.kind === "category_pct" || a.kind === "category_abs" || a.kind === "category_set") {
      const f = fixed[a.category] ?? 0;
      const v = variable[a.category] ?? 0;
      const total = f + v;
      const next = a.kind === "category_pct" ? total * (1 + a.pct / 100) : a.kind === "category_abs" ? total + a.amount : a.amount;
      // scale both parts proportionally; if the category had nothing, put it in variable
      if (total > 0) {
        fixed[a.category] = Math.round((f / total) * next);
        variable[a.category] = Math.round((v / total) * next);
      } else variable[a.category] = Math.max(0, Math.round(next));
    }
  }
  const byCategory: Partial<Record<Category, number>> = {};
  for (const [c, v] of Object.entries(fixed)) byCategory[c as Category] = (byCategory[c as Category] ?? 0) + (v ?? 0);
  for (const [c, v] of Object.entries(variable)) byCategory[c as Category] = (byCategory[c as Category] ?? 0) + (v ?? 0);
  const fixedTotal = sum(Object.values(fixed).map((x) => x ?? 0)) + extraFixed;
  const variableTotal = sum(Object.values(variable).map((x) => x ?? 0));
  return { income, fixed: fixedTotal, variable: variableTotal, byCategory, fixedByCategory: fixed, variableByCategory: variable, extraFixed, surplus: income - fixedTotal - variableTotal };
}

export interface ProjectionPoint {
  month: string; // YYYY-MM, balance at month end
  likely: number;
  optimistic: number;
  pessimistic: number;
}

export interface GoalResult {
  goal: Goal;
  projected: string | null; // YYYY-MM when funded (likely)
  optimistic: string | null;
  pessimistic: string | null;
  onTrack: boolean;
  monthsLate: number;
}

export interface Projection {
  plan: MonthPlan;
  points: ProjectionPoint[];
  goals: GoalResult[];
  /** the goal currently being funded (nearest), used by the goal-impact lens */
  nearestGoal: GoalResult | null;
}

const HORIZON = 72;

function fundGoals(goals: Goal[], surplusAt: (k: number) => number, oneOffs: Record<string, number>, startMonth: string, horizon = HORIZON): Record<string, string | null> {
  const sorted = [...goals].sort((a, b) => a.priority - b.priority);
  const alloc: Record<string, number> = Object.fromEntries(sorted.map((g) => [g.id, g.allocated_so_far]));
  const done: Record<string, string | null> = Object.fromEntries(sorted.map((g) => [g.id, g.allocated_so_far >= g.target_amount ? startMonth : null]));
  for (let k = 1; k <= horizon; k++) {
    const month = addMonths(startMonth, k);
    let pool = surplusAt(k) - (oneOffs[month] ?? 0);
    if (pool <= 0) continue;
    for (const g of sorted) {
      if (done[g.id]) continue;
      const need = g.target_amount - alloc[g.id];
      const give = Math.min(need, pool);
      alloc[g.id] += give;
      pool -= give;
      if (alloc[g.id] >= g.target_amount) done[g.id] = month;
      if (pool <= 0) break;
    }
  }
  return done;
}

export function project(
  base: Baseline,
  assumptions: Assumption[],
  goals: Goal[],
  startBalance: number,
  today: string,
  months: number,
): Projection {
  const start = ym(today);
  // plan per month: assumptions with a `from` month switch on at that month
  const froms = [...new Set(assumptions.map((a) => ("from" in a ? a.from : undefined)).filter((f): f is string => !!f))];
  const planFor = (m: string) => applyAssumptions(base, assumptions.filter((a) => !("from" in a) || !a.from || a.from <= m));
  const cache = new Map<string, MonthPlan>();
  const planAt = (m: string) => {
    const key = froms.filter((f) => f <= m).sort().join(",");
    if (!cache.has(key)) cache.set(key, planFor(m));
    return cache.get(key)!;
  };
  // the plan shown as "monthly" is the one in effect after every dated change has kicked in
  const plan = applyAssumptions(base, assumptions);
  const goalsAdj = goals.map((g) => {
    let out = { ...g };
    for (const a of assumptions) {
      if (a.kind === "goal_change" && a.goal_id === g.id) {
        out = { ...out, ...(a.target_amount != null ? { target_amount: a.target_amount } : {}), ...(a.target_date ? { target_date: a.target_date } : {}) };
      }
    }
    return out;
  });
  const oneOffs: Record<string, number> = {};
  for (const a of assumptions) if (a.kind === "one_off") oneOffs[ym(a.date)] = (oneOffs[ym(a.date)] ?? 0) + a.amount;

  const sigma = base.variableSigma;
  const surplusAt = (k: number) => planAt(addMonths(start, k)).surplus;
  const points: ProjectionPoint[] = [{ month: start, likely: startBalance, optimistic: startBalance, pessimistic: startBalance }];
  let bal = { likely: startBalance, optimistic: startBalance, pessimistic: startBalance };
  for (let k = 1; k <= months; k++) {
    const m = addMonths(start, k);
    const o = oneOffs[m] ?? 0;
    const sp = surplusAt(k);
    bal = { likely: bal.likely + sp - o, optimistic: bal.optimistic + sp + sigma - o, pessimistic: bal.pessimistic + sp - sigma - o };
    points.push({ month: m, ...bal });
  }

  const dl = fundGoals(goalsAdj, surplusAt, oneOffs, start);
  const dop = fundGoals(goalsAdj, (k) => surplusAt(k) + sigma, oneOffs, start);
  const dpe = fundGoals(goalsAdj, (k) => surplusAt(k) - sigma, oneOffs, start);
  const results: GoalResult[] = [...goalsAdj]
    .sort((a, b) => a.priority - b.priority)
    .map((g) => {
      const p = dl[g.id];
      const target = ym(g.target_date);
      const late = p ? Math.max(0, monthDiff(target, p)) : 999;
      return { goal: g, projected: p, optimistic: dop[g.id], pessimistic: dpe[g.id], onTrack: !!p && p <= target, monthsLate: late };
    });
  const nearestGoal = results.find((r) => r.goal.allocated_so_far < r.goal.target_amount) ?? null;
  return { plan, points, goals: results, nearestGoal };
}

function monthDiff(a: string, b: string): number {
  return (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));
}

/** Month-end balances for history, walking back from the current balance. */
export function balanceHistory(txns: Transaction[], currentBalance: number): { month: string; balance: number }[] {
  const months = [...new Set(txns.map((t) => ym(t.date)))].sort();
  const net = (m: string) => sum(txns.filter((t) => ym(t.date) === m).map((t) => (t.direction === "credit" ? t.amount : -t.amount)));
  const out: { month: string; balance: number }[] = [];
  let bal = currentBalance;
  // end-of-month balance for m = current balance minus the net flow of every later month
  for (let i = months.length - 1; i >= 0; i--) {
    out.unshift({ month: months[i], balance: bal });
    bal -= net(months[i]);
  }
  return out;
}

/** Goal-impact lens (addendum): days a given spend pushes the nearest goal back. amount / monthly surplus × 30. */
export function goalImpactDays(amount: number, monthlySurplus: number): number | null {
  if (monthlySurplus <= 0) return null;
  return Math.round((amount / monthlySurplus) * 30 * 10) / 10;
}
