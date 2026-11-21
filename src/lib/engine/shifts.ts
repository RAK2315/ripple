import type { Assumption, Category, Goal, Recurring } from "../types";
import { daysBetween } from "./dates";
import { project, type Baseline } from "./projection";

/** Income or a fixed cost moved by ≥ 10% between consecutive charges, recently. Pure arithmetic on detected recurring payments. */
export interface Shift {
  id: string;
  kind: "income" | "fixed";
  recurringId: string;
  label: string;
  category: Category;
  before: number; // paise per month
  after: number;
  changedOn: string;
  pct: number;
  ids: string[];
}

export const SHIFT_THRESHOLD = 0.1;

export function detectShifts(recurring: Recurring[], today: string, windowDays = 150): Shift[] {
  return recurring
    .filter((r) => r.previous_amount != null && r.changed_on && daysBetween(r.changed_on, today) <= windowDays && r.status !== "unused")
    .map((r) => {
      const ratio = r.monthly_amount / Math.max(1, r.amount);
      const before = Math.round(r.previous_amount! * ratio);
      const after = r.monthly_amount;
      return {
        id: `shift_${r.id}_${r.changed_on}`,
        kind: r.direction === "credit" ? ("income" as const) : ("fixed" as const),
        recurringId: r.id,
        label: r.merchant_normalized,
        category: r.category,
        before,
        after,
        changedOn: r.changed_on!,
        pct: (after - before) / Math.max(1, before),
        ids: r.transaction_ids,
      };
    })
    .filter((s) => Math.abs(s.pct) >= SHIFT_THRESHOLD)
    .sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before));
}

/**
 * Re-plan: the baseline already runs on the new amount. Compare it with the plan as it stood before the change,
 * so the user sees which goal dates moved because of it.
 */
export function replan(
  shift: Shift,
  base: Baseline,
  goals: Goal[],
  balance: number,
  today: string,
): { goal: string; before: string | null; after: string | null }[] {
  const delta = shift.after - shift.before;
  const undo: Assumption =
    shift.kind === "income" ? { kind: "income_change", amount: -delta } : { kind: "category_abs", category: shift.category, amount: -delta };
  const now = project(base, [], goals, balance, today, 24);
  const old = project(base, [undo], goals, balance, today, 24);
  return now.goals.map((g) => ({ goal: g.goal.name, before: old.goals.find((x) => x.goal.id === g.goal.id)?.projected ?? null, after: g.projected }));
}
