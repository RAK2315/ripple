import type { Cadence, Recurring, Transaction } from "../types";
import { daysBetween } from "./dates";

const CADENCES: { cadence: Cadence; min: number; max: number; perMonth: number }[] = [
  { cadence: "weekly", min: 6, max: 8, perMonth: 52 / 12 },
  { cadence: "monthly", min: 27, max: 32, perMonth: 1 },
  { cadence: "yearly", min: 358, max: 372, perMonth: 1 / 12 },
];

const DISCRETIONARY: string[] = ["Fitness", "Entertainment", "Education"];

const within = (a: number, b: number, pct = 0.05) => Math.abs(a - b) <= pct * Math.max(a, b);

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/**
 * Pure arithmetic recurring detection (spec 3.3). A merchant is recurring if it appears ≥3 times,
 * ≥75% of gaps fall in a cadence window, and amounts stay within 5% (allowing one step change → "changed").
 */
export function detectRecurring(
  txns: Transaction[],
  today: string,
  markedUnused: Record<string, boolean> = {},
): Recurring[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of txns) {
    const key = `${t.direction}|${t.merchant_normalized ?? t.raw_description}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }
  const out: Recurring[] = [];
  for (const [key, list] of groups) {
    if (list.length < 3) continue;
    const rows = [...list].sort((a, b) => (a.date < b.date ? -1 : 1));
    const gaps = rows.slice(1).map((r, i) => daysBetween(rows[i].date, r.date));
    const c = CADENCES.find((cd) => gaps.filter((g) => g >= cd.min && g <= cd.max).length >= Math.ceil(gaps.length * 0.75));
    if (!c) continue;

    const amounts = rows.map((r) => r.amount);
    const last = amounts[amounts.length - 1];
    let previous: number | null = null;
    let changedOn: string | null = null;
    if (!amounts.every((a) => within(a, median(amounts)))) {
      // find a single step change: everything before ≈ one amount, everything after ≈ another
      let split = -1;
      for (let i = amounts.length - 1; i > 0; i--) {
        if (!within(amounts[i], amounts[i - 1])) {
          split = i;
          break;
        }
      }
      if (split < 1) continue;
      const before = amounts.slice(0, split);
      const after = amounts.slice(split);
      if (!before.every((a) => within(a, median(before))) || !after.every((a) => within(a, median(after)))) continue;
      previous = median(before);
      changedOn = rows[split].date;
    }
    const lastSeen = rows[rows.length - 1].date;
    // stale: last charge older than 1.6 cadence windows
    if (daysBetween(lastSeen, today) > c.max * 1.6) continue;

    const merchant = key.split("|")[1];
    const id = `rec_${merchant.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
    let status: Recurring["status"] = "active";
    if (daysBetween(rows[0].date, today) <= 60) status = "new";
    if (changedOn && daysBetween(changedOn, today) <= 150) status = "changed";
    // "unused" is not knowable from a bank statement: we infer it (discretionary category with no related spending) or the user marks it.
    const discretionary = DISCRETIONARY.includes(rows[rows.length - 1].category ?? "Other");
    const ownIds = new Set(rows.map((r) => r.id));
    const related = txns.some((t) => !ownIds.has(t.id) && t.category === rows[rows.length - 1].category);
    const inferred = discretionary && !related && rows[0].direction === "debit";
    if (markedUnused[id] === true || (markedUnused[id] !== false && inferred)) status = "unused";

    const amount = previous != null ? last : median(amounts);
    out.push({
      id,
      merchant_normalized: merchant,
      category: rows[rows.length - 1].category ?? "Other",
      amount,
      previous_amount: previous,
      changed_on: changedOn,
      cadence: c.cadence,
      first_seen: rows[0].date,
      last_seen: lastSeen,
      status,
      direction: rows[0].direction,
      transaction_ids: rows.map((r) => r.id),
      monthly_amount: Math.round(amount * c.perMonth),
      inferred_unused: inferred && markedUnused[id] === undefined,
    });
  }
  return out.sort((a, b) => b.monthly_amount - a.monthly_amount);
}
