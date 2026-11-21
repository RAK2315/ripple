import type { Category, Recurring, Transaction } from "../types";
import type { MonthPlan } from "./projection";
import { ym } from "./dates";

export interface FlowItem {
  label: string;
  amount: number;
  ids: string[];
  leak?: boolean;
}

export interface MonthFlows {
  month: string;
  kind: "actual" | "projected";
  income: FlowItem;
  fixed: FlowItem[];
  variable: FlowItem[];
  saved: number;
  deficit: number;
}

const total = (xs: FlowItem[]) => xs.reduce((a, x) => a + x.amount, 0);

/** Actual flows for a past/current month: credits in, recurring debits = fixed, the rest = variable. Unused subscriptions become leaks. */
export function actualFlows(month: string, txns: Transaction[], recurring: Recurring[]): MonthFlows {
  const inMonth = txns.filter((t) => ym(t.date) === month);
  const recById = new Map<string, Recurring>();
  for (const r of recurring) for (const id of r.transaction_ids) recById.set(id, r);
  const credits = inMonth.filter((t) => t.direction === "credit");
  const fixedMap = new Map<string, FlowItem>();
  const varMap = new Map<string, FlowItem>();
  for (const t of inMonth) {
    if (t.direction !== "debit") continue;
    const r = recById.get(t.id);
    const leak = r?.status === "unused";
    const label = leak ? `Leak: ${r!.merchant_normalized}` : (t.category ?? "Other");
    const map = r && r.direction === "debit" ? fixedMap : varMap;
    const item = map.get(label) ?? { label, amount: 0, ids: [], leak };
    item.amount += t.amount;
    item.ids.push(t.id);
    map.set(label, item);
  }
  const income: FlowItem = { label: "Income", amount: credits.reduce((a, t) => a + t.amount, 0), ids: credits.map((t) => t.id) };
  const fixed = [...fixedMap.values()].sort((a, b) => Number(!!a.leak) - Number(!!b.leak) || b.amount - a.amount);
  const variable = collapse([...varMap.values()].sort((a, b) => b.amount - a.amount), 7);
  const out = total(fixed) + total(variable);
  return { month, kind: "actual", income, fixed, variable, saved: Math.max(0, income.amount - out), deficit: Math.max(0, out - income.amount) };
}

/** Projected flows for a future month, from the scenario plan. */
export function plannedFlows(month: string, plan: MonthPlan, recurring: Recurring[]): MonthFlows {
  const leaks = recurring.filter((r) => r.status === "unused" && r.direction === "debit");
  const fixed: FlowItem[] = [];
  for (const [c, v] of Object.entries(plan.fixedByCategory)) {
    let amt = v ?? 0;
    for (const l of leaks) if (l.category === c) amt -= l.monthly_amount;
    if (amt > 0) fixed.push({ label: c, amount: amt, ids: [] });
  }
  if (plan.extraFixed > 0) fixed.push({ label: "New recurring", amount: plan.extraFixed, ids: [] });
  for (const l of leaks) fixed.push({ label: `Leak: ${l.merchant_normalized}`, amount: l.monthly_amount, ids: l.transaction_ids, leak: true });
  fixed.sort((a, b) => Number(!!a.leak) - Number(!!b.leak) || b.amount - a.amount);
  const variable = collapse(
    Object.entries(plan.variableByCategory)
      .map(([c, v]) => ({ label: c as Category, amount: v ?? 0, ids: [] as string[] }))
      .filter((x) => x.amount > 0)
      .sort((a, b) => b.amount - a.amount),
    7,
  );
  const out = total(fixed) + total(variable);
  return {
    month,
    kind: "projected",
    income: { label: "Income", amount: plan.income, ids: [] },
    fixed,
    variable,
    saved: Math.max(0, plan.income - out),
    deficit: Math.max(0, out - plan.income),
  };
}

function collapse(items: FlowItem[], keep: number): FlowItem[] {
  if (items.length <= keep) return items;
  const head = items.slice(0, keep - 1);
  const tail = items.slice(keep - 1);
  return [...head, { label: "Everything else", amount: total(tail), ids: tail.flatMap((t) => t.ids) }];
}
