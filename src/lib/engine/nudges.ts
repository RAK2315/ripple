import type { Category, Goal, Recurring, Transaction } from "../types";
import type { Baseline } from "./projection";
import { project } from "./projection";
import { daysInMonth, ym } from "./dates";

export interface Nudge {
  id: string;
  category: Category;
  spent: number;
  expectedFull: number;
  expectedByNow: number;
  daysLeft: number;
  drivers: Transaction[];
  ids: string[];
  /** if the current pace continues */
  projectedFull: number;
  goalName: string | null;
  goalFrom: string | null;
  goalTo: string | null;
}

/** Spec 3.6: mid-month, a category tracking >20% above its expected pace raises a nudge. Pure arithmetic. */
export function computeNudges(
  txns: Transaction[],
  recurring: Recurring[],
  base: Baseline,
  goals: Goal[],
  balance: number,
  today: string,
): Nudge[] {
  const month = ym(today);
  const day = +today.slice(8, 10);
  const dim = daysInMonth(month);
  const frac = day / dim;
  const recIds = new Set(recurring.flatMap((r) => r.transaction_ids));
  const mainProj = project(base, [], goals, balance, today, 24);
  const out: Nudge[] = [];
  for (const [cat, expectedFull] of Object.entries(base.variableByCategory) as [Category, number][]) {
    if (!expectedFull) continue;
    const rows = txns.filter((t) => t.direction === "debit" && ym(t.date) === month && t.category === cat && !recIds.has(t.id));
    const spent = rows.reduce((a, t) => a + t.amount, 0);
    const expectedByNow = expectedFull * frac;
    if (spent <= expectedByNow * 1.2 || spent < 50000) continue;
    const projectedFull = Math.round(spent / frac);
    const extra = projectedFull - expectedFull;
    const alt = project(base, [{ kind: "category_abs", category: cat, amount: extra }], goals, balance, today, 24);
    const g0 = mainProj.nearestGoal;
    const g1 = alt.goals.find((g) => g.goal.id === g0?.goal.id);
    const drivers = [...rows].sort((a, b) => b.amount - a.amount).slice(0, 3).sort((a, b) => (a.date < b.date ? -1 : 1));
    out.push({
      id: `nudge_${month}_${cat}`,
      category: cat,
      spent,
      expectedFull,
      expectedByNow: Math.round(expectedByNow),
      daysLeft: dim - day,
      drivers,
      ids: rows.map((r) => r.id),
      projectedFull,
      goalName: g0?.goal.name ?? null,
      goalFrom: g0?.projected ?? null,
      goalTo: g1?.projected ?? null,
    });
  }
  return out.sort((a, b) => b.spent / b.expectedByNow - a.spent / a.expectedByNow);
}
