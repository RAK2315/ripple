import type { Advice, Category, Recurring, Transaction } from "../types";
import { addMonths, ym } from "./dates";

/**
 * Savings opportunities found in the history. Pure arithmetic: every rupee figure here is computed from
 * transactions. The model (in /api/advice) only chooses among these and writes the words around them.
 */
export interface Opportunity {
  /** stable key, so the same opportunity is never added twice */
  key: string;
  kind: "unused_subscription" | "price_rise" | "new_subscription" | "rides_with_pass" | "marketplace_orders" | "category_growth";
  /** the merchant or category the advice is about */
  label: string;
  /** the step that produces the saving; the advice text always starts with it */
  action: string;
  category: Category;
  /** paise per month, > 0 */
  monthly_saving: number;
  /** figures the model may place via {placeholders}, already formatted by the caller */
  facts: Record<string, number | string>;
  evidence_ids: string[];
}

const DISCRETIONARY: Category[] = ["Dining", "Shopping", "Entertainment", "Travel", "Groceries", "Transport", "Fuel", "Subscriptions"];
const MIN_SAVING = 30000; // ₹300/month: below this it is noise, not advice
const RIDE_HAILING = /\b(uber|ola|rapido|blusmart|namma yatri|meru)\b/i;
const MARKETPLACE = /\b(amazon|flipkart|myntra|meesho|ajio|nykaa|tata cliq)\b/i;

export function findOpportunities(txns: Transaction[], recurring: Recurring[], today: string): Opportunity[] {
  const out: Opportunity[] = [];
  const debits = recurring.filter((r) => r.direction === "debit");

  for (const r of debits) {
    if (r.status === "unused")
      out.push({
        key: `unused_${r.id}`,
        kind: "unused_subscription",
        label: r.merchant_normalized,
        action: `Cancel ${r.merchant_normalized}`,
        category: r.category,
        monthly_saving: r.monthly_amount,
        facts: { monthly: r.monthly_amount, yearly: r.monthly_amount * 12, since: r.first_seen },
        evidence_ids: r.transaction_ids,
      });
    else if (r.status === "changed" && r.previous_amount != null && r.amount > r.previous_amount)
      out.push({
        key: `price_${r.id}_${r.changed_on}`,
        kind: "price_rise",
        label: r.merchant_normalized,
        action: `Move ${r.merchant_normalized} back to the cheaper plan`,
        category: r.category,
        monthly_saving: Math.round((r.amount - r.previous_amount) * (r.monthly_amount / Math.max(1, r.amount))),
        facts: { before: r.previous_amount, after: r.amount, changed_on: r.changed_on ?? "" },
        evidence_ids: r.transaction_ids,
      });
  }

  const cur = ym(today);
  const recent = [addMonths(cur, -3), addMonths(cur, -2), addMonths(cur, -1)];
  const earlier = [addMonths(cur, -6), addMonths(cur, -5), addMonths(cur, -4)];
  const recIds = new Set(recurring.flatMap((r) => r.transaction_ids));
  const inRecent = (t: Transaction) => recent.includes(ym(t.date));

  // a newly started discretionary subscription: worth a deliberate yes
  for (const r of debits)
    if (r.status === "new" && DISCRETIONARY.includes(r.category) && r.monthly_amount >= MIN_SAVING)
      out.push({
        key: `new_${r.id}`,
        kind: "new_subscription",
        label: r.merchant_normalized,
        action: `Review the new ${r.merchant_normalized} subscription`,
        category: r.category,
        monthly_saving: r.monthly_amount,
        facts: { monthly: r.monthly_amount, since: r.first_seen },
        evidence_ids: r.transaction_ids,
      });

  // cab rides while already paying for a transit pass: half the rides on the pass (stated assumption: 50%)
  const pass = debits.find((r) => r.category === "Transport" && r.status !== "unused");
  const rides = txns.filter((t) => t.direction === "debit" && inRecent(t) && RIDE_HAILING.test(t.merchant_normalized ?? t.raw_description));
  const rideAvg = Math.round(rides.reduce((a, t) => a + t.amount, 0) / 3);
  if (pass && rideAvg >= 2 * MIN_SAVING)
    out.push({
      key: `rides_${pass.id}_${cur}`,
      kind: "rides_with_pass",
      label: "cab rides",
      action: `Take half your cab rides on the ${pass?.merchant_normalized ?? "transit"} pass you already pay for`,
      category: "Transport",
      monthly_saving: Math.round(rideAvg * 0.5),
      facts: { ride_spend: rideAvg, rides_per_month: Math.round(rides.length / 3), pass: pass.merchant_normalized, pass_cost: pass.monthly_amount, share_pct: 50 },
      evidence_ids: rides.map((t) => t.id),
    });

  // marketplace orders: one fewer a month, valued at the user's own average order
  const orders = txns.filter((t) => t.direction === "debit" && inRecent(t) && MARKETPLACE.test(t.merchant_normalized ?? t.raw_description));
  const perMonth = orders.length / 3;
  if (perMonth >= 2) {
    const avgOrder = Math.round(orders.reduce((a, t) => a + t.amount, 0) / orders.length);
    if (avgOrder >= MIN_SAVING)
      out.push({
        key: `orders_${cur}`,
        kind: "marketplace_orders",
        label: "online shopping orders",
        action: "Place one fewer online shopping order a month",
        category: "Shopping",
        monthly_saving: avgOrder,
        facts: { orders_per_month: Math.round(perMonth * 10) / 10, avg_order: avgOrder },
        evidence_ids: orders.map((t) => t.id),
      });
  }

  // category growth: last 3 complete months vs the 3 before, recurring payments excluded
  for (const c of DISCRETIONARY) {
    const rows = txns.filter((t) => t.direction === "debit" && t.category === c && !recIds.has(t.id));
    const sumIn = (ms: string[]) => rows.filter((t) => ms.includes(ym(t.date))).reduce((a, t) => a + t.amount, 0);
    const avgRecent = Math.round(sumIn(recent) / 3);
    const avgEarlier = Math.round(sumIn(earlier) / 3);
    if (avgEarlier <= 0) continue;
    const growth = avgRecent - avgEarlier;
    if (growth < MIN_SAVING || growth / avgEarlier < 0.15) continue;
    out.push({
      key: `growth_${c}_${cur}`,
      kind: "category_growth",
      label: c,
      action: `Bring ${c} back to its level of three months ago`,
      category: c,
      monthly_saving: growth,
      facts: { recent: avgRecent, earlier: avgEarlier, growth, pct: Math.round((growth / avgEarlier) * 100) },
      evidence_ids: rows.filter((t) => recent.includes(ym(t.date))).map((t) => t.id),
    });
  }

  return out.filter((o) => o.monthly_saving >= MIN_SAVING || o.kind !== "category_growth").sort((a, b) => b.monthly_saving - a.monthly_saving);
}

/** Opportunities not already covered by advice still open (seeded or generated earlier). */
export function freshOpportunities(opps: Opportunity[], advice: Advice[]): Opportunity[] {
  const open = advice.filter((a) => !a.accepted);
  return opps.filter((o) => {
    if (advice.some((a) => a.id === adviceId(o))) return false;
    const label = o.label.toLowerCase().split(/\s+/)[0];
    return !open.some((a) => a.text.split(/\.\s/)[0].toLowerCase().includes(label));
  });
}

export const adviceId = (o: Opportunity) => `adv_live_${o.key.toLowerCase().replace(/[^a-z0-9_-]+/g, "_")}`.slice(0, 64);
