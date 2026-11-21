import type { Category, Recurring, Transaction } from "../types";
import { ym } from "./dates";

export interface CategoryLine {
  category: Category;
  amount: number;
  prev: number;
  delta: number;
  ids: string[];
}

export interface MonthReview {
  month: string;
  prevMonth: string | null;
  income: number;
  incomeIds: string[];
  spend: number;
  spendIds: string[];
  net: number;
  categories: CategoryLine[];
  newRecurring: Recurring[];
  changedRecurring: Recurring[];
  biggestChange: CategoryLine | null;
  opportunity: { text: string; monthly: number; ids: string[] } | null;
}

const sum = (xs: Transaction[]) => xs.reduce((a, t) => a + t.amount, 0);

/** Monthly review figures. Pure arithmetic; the model only writes words around these. */
export function monthReview(txns: Transaction[], recurring: Recurring[], month: string): MonthReview {
  const months = [...new Set(txns.map((t) => ym(t.date)))].sort();
  const prevMonth = months.filter((m) => m < month).pop() ?? null;
  const inMonth = txns.filter((t) => ym(t.date) === month);
  const inPrev = prevMonth ? txns.filter((t) => ym(t.date) === prevMonth) : [];
  const credits = inMonth.filter((t) => t.direction === "credit");
  const debits = inMonth.filter((t) => t.direction === "debit");
  const cats = new Set<Category>([...debits, ...inPrev.filter((t) => t.direction === "debit")].map((t) => (t.category ?? "Other") as Category));
  const categories: CategoryLine[] = [...cats]
    .map((c) => {
      const rows = debits.filter((t) => (t.category ?? "Other") === c);
      const prev = sum(inPrev.filter((t) => t.direction === "debit" && (t.category ?? "Other") === c));
      const amount = sum(rows);
      return { category: c, amount, prev, delta: amount - prev, ids: rows.map((t) => t.id) };
    })
    .sort((a, b) => b.amount - a.amount);
  const newRecurring = recurring.filter((r) => ym(r.first_seen) === month || (r.status === "new" && ym(r.first_seen) <= month));
  const changedRecurring = recurring.filter((r) => r.changed_on && ym(r.changed_on) <= month && r.status === "changed");
  const biggestChange = [...categories].filter((c) => c.prev > 0 || c.amount > 0).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0] ?? null;

  // biggest opportunity: the largest of (unused subscriptions, the category that grew most)
  const unused = recurring.filter((r) => r.status === "unused" && r.direction === "debit");
  const unusedMonthly = unused.reduce((a, r) => a + r.monthly_amount, 0);
  const grew = categories.filter((c) => c.delta > 0).sort((a, b) => b.delta - a.delta)[0];
  let opportunity: MonthReview["opportunity"] = null;
  if (grew && grew.delta > unusedMonthly) opportunity = { text: `bringing ${grew.category} back to last month's level`, monthly: grew.delta, ids: grew.ids };
  else if (unusedMonthly > 0)
    opportunity = { text: `stopping payments for ${unused.map((r) => r.merchant_normalized).join(", ")}`, monthly: unusedMonthly, ids: unused.flatMap((r) => r.transaction_ids) };

  return {
    month,
    prevMonth,
    income: sum(credits),
    incomeIds: credits.map((t) => t.id),
    spend: sum(debits),
    spendIds: debits.map((t) => t.id),
    net: sum(credits) - sum(debits),
    categories,
    newRecurring,
    changedRecurring,
    biggestChange,
    opportunity,
  };
}
