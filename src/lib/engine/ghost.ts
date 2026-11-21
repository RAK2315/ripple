import type { Advice, Transaction } from "../types";
import { addMonths, ym } from "./dates";
import type { ProjectionPoint } from "./projection";

/**
 * Regret Engine. Pure arithmetic: for every piece of advice not taken, the promised monthly saving is banked
 * at each month end after the month it was given, and the pot grows at `annualRate` (a plain savings rate).
 */

export interface AdviceRegret {
  advice: Advice;
  months: number;
  /** pot from this advice at `asOf` month end, paise */
  amount: number;
  /** transactions after the advice that show it was not followed (same merchant/category) */
  evidenceIds: string[];
}

export function potAt(saving: number, givenMonth: string, month: string, annualRate: number): number {
  const r = annualRate / 12;
  let pot = 0;
  for (let m = addMonths(givenMonth, 1); m <= month; m = addMonths(m, 1)) pot = pot * (1 + r) + saving;
  return Math.round(pot);
}

export function monthsSince(givenMonth: string, month: string): number {
  return Math.max(0, (+month.slice(0, 4) - +givenMonth.slice(0, 4)) * 12 + (+month.slice(5, 7) - +givenMonth.slice(5, 7)));
}

/** Transactions after the advice date that match a merchant or category named in the advice text. */
export function adviceEvidence(a: Advice, txns: Transaction[]): string[] {
  // first sentence names what to change ("Cancel YouTube Premium."); later ones may name things to keep
  const text = a.text.split(/\.\s/)[0].toLowerCase();
  const merchants = [...new Set(txns.map((t) => t.merchant_normalized ?? "").filter(Boolean))].filter((m) => {
    const key = m.toLowerCase().split(/\s+/)[0];
    return key.length >= 4 && text.includes(key);
  });
  const categories = [...new Set(txns.map((t) => t.category ?? ""))].filter((c) => c && text.includes(c.toLowerCase()));
  const deliveryHint = /food delivery/.test(text);
  return txns
    .filter((t) => t.direction === "debit" && t.date > a.date_given)
    .filter(
      (t) =>
        merchants.includes(t.merchant_normalized ?? "") ||
        categories.includes(t.category ?? "") ||
        (deliveryHint && /swiggy|zomato/i.test(t.merchant_normalized ?? "")),
    )
    .map((t) => t.id);
}

export interface Ghost {
  regret: number;
  items: AdviceRegret[];
  /** monthly saving the ghost has that you don't */
  monthlyGap: number;
  /** month → pot, for history months and projected months */
  potByMonth: Record<string, number>;
}

export function computeGhost(
  advice: Advice[],
  txns: Transaction[],
  months: string[],
  today: string,
  annualRate: number,
  evidence: Record<string, string[]> = {},
): Ghost {
  const open = advice.filter((a) => !a.accepted);
  const asOf = ym(today);
  const items = open
    .map((a) => ({
      advice: a,
      months: monthsSince(ym(a.date_given), asOf),
      amount: potAt(a.projected_monthly_saving, ym(a.date_given), asOf, annualRate),
      evidenceIds: evidence[a.id] ?? adviceEvidence(a, txns),
    }))
    .sort((x, y) => y.amount - x.amount);
  const potByMonth: Record<string, number> = {};
  for (const m of months) potByMonth[m] = open.reduce((s, a) => s + potAt(a.projected_monthly_saving, ym(a.date_given), m, annualRate), 0);
  return {
    regret: items.reduce((s, i) => s + i.amount, 0),
    items,
    monthlyGap: open.reduce((s, a) => s + a.projected_monthly_saving, 0),
    potByMonth,
  };
}

/** Ghost line rows: real balance (history, then projected likely) plus the ghost's pot. */
export function ghostSeries(
  history: { month: string; balance: number }[],
  points: ProjectionPoint[],
  potByMonth: Record<string, number>,
): { month: string; real: number; ghost: number; future: boolean }[] {
  const rows: { month: string; real: number; ghost: number; future: boolean }[] = [];
  const seen = new Set<string>();
  for (const h of history) {
    rows.push({ month: h.month, real: h.balance, ghost: h.balance + (potByMonth[h.month] ?? 0), future: false });
    seen.add(h.month);
  }
  for (const p of points) {
    if (seen.has(p.month)) continue;
    rows.push({ month: p.month, real: p.likely, ghost: p.likely + (potByMonth[p.month] ?? 0), future: true });
  }
  return rows;
}
