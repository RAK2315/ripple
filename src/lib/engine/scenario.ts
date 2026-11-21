import type { Assumption, Goal, Recurring } from "../types";
import type { RawAssumption } from "../scenario-parse";
import { formatINR, monthLabelLong } from "../format";
import { addMonths, ym } from "./dates";
import type { Projection } from "./projection";

/**
 * Turn parameters lifted from the user's sentence into typed assumptions. Rupees → paise.
 * Any figure not literally stated (removed subscription amount, income % in rupees) is computed here from the user's data.
 */
export function convertRaw(raw: RawAssumption[], ctx: { recurring: Recurring[]; income: number; today: string }): Assumption[] {
  const out: Assumption[] = [];
  const paise = (r: number | null | undefined) => Math.round((r ?? 0) * 100);
  for (const r of raw) {
    const from = r.from_month && /^\d{4}-\d{2}$/.test(r.from_month) ? r.from_month : undefined;
    const withFrom = <T extends object>(a: T) => (from ? { ...a, from } : a);
    switch (r.kind) {
      case "category_pct":
        if (r.category && r.pct != null) out.push(withFrom({ kind: "category_pct" as const, category: r.category, pct: r.pct }));
        break;
      case "category_abs":
        if (r.category && r.amount_rupees != null) out.push(withFrom({ kind: "category_abs" as const, category: r.category, amount: paise(r.amount_rupees) }));
        break;
      case "category_set":
        if (r.category && r.amount_rupees != null) out.push(withFrom({ kind: "category_set" as const, category: r.category, amount: paise(r.amount_rupees) }));
        break;
      case "income_change":
        if (r.amount_rupees != null) out.push(withFrom({ kind: "income_change" as const, amount: paise(r.amount_rupees) }));
        break;
      case "income_pct":
        if (r.pct != null) out.push(withFrom({ kind: "income_change" as const, amount: Math.round((ctx.income * r.pct) / 100) }));
        break;
      case "income_stop":
        out.push(withFrom({ kind: "income_change" as const, amount: -ctx.income }));
        break;
      case "one_off": {
        const date = r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : `${addMonths(ym(ctx.today), 1)}-15`;
        if (r.amount_rupees != null) out.push({ kind: "one_off", label: r.label || "One-off expense", amount: paise(r.amount_rupees), date });
        break;
      }
      case "add_recurring":
        if (r.amount_rupees != null) out.push(withFrom({ kind: "add_recurring" as const, label: r.label || "New monthly cost", amount: paise(r.amount_rupees) }));
        break;
      case "remove_recurring": {
        const rec = ctx.recurring.find((x) => x.id === r.recurring_id);
        if (rec) out.push(withFrom({ kind: "remove_recurring" as const, label: rec.merchant_normalized, amount: rec.monthly_amount, recurring_id: rec.id }));
        break;
      }
      case "goal_change":
        if (r.goal_id && (r.target_amount_rupees != null || r.target_date))
          out.push({
            kind: "goal_change",
            goal_id: r.goal_id,
            ...(r.target_amount_rupees != null ? { target_amount: paise(r.target_amount_rupees) } : {}),
            ...(r.target_date ? { target_date: r.target_date } : {}),
          });
        break;
    }
  }
  return out;
}

/** Plain-English line for an assumption. */
export function describeAssumption(a: Assumption, goals: Goal[] = []): string {
  const when = "from" in a && a.from ? ` from ${monthLabelLong(a.from)}` : "";
  switch (a.kind) {
    case "category_pct":
      return `${a.category} ${a.pct < 0 ? "down" : "up"} ${Math.abs(Math.round(a.pct * 10) / 10)}%${when}`;
    case "category_abs":
      return `${a.category} ${a.amount < 0 ? "−" : "+"}${formatINR(Math.abs(a.amount))}/month${when}`;
    case "category_set":
      return `${a.category} becomes ${formatINR(a.amount)}/month${when}`;
    case "income_change":
      return `Income ${a.amount < 0 ? "−" : "+"}${formatINR(Math.abs(a.amount))}/month${when}`;
    case "one_off":
      return `One-off: ${a.label} ${formatINR(a.amount)} on ${a.date}`;
    case "add_recurring":
      return `New monthly cost: ${a.label} ${formatINR(a.amount)}${when}`;
    case "remove_recurring":
      return `Drop ${a.label} (saves ${formatINR(a.amount)}/month)${when}`;
    case "goal_change": {
      const g = goals.find((x) => x.id === a.goal_id)?.name ?? a.goal_id;
      return `${g}: ${a.target_amount != null ? `target ${formatINR(a.target_amount)}` : ""}${a.target_amount != null && a.target_date ? ", " : ""}${a.target_date ? `by ${a.target_date}` : ""}`;
    }
  }
}

export interface DiffRow {
  key: string;
  label: string;
  a: number | string | null;
  b: number | string | null;
  kind: "money" | "month" | "text";
  changed: boolean;
  /** positive = B better */
  better: boolean | null;
}

const monthsApart = (a: string, b: string) => (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));

/** Side-by-side numbers for two projections. All arithmetic, no model. */
export function scenarioDiff(
  A: Projection,
  B: Projection,
  horizon = 12,
): { rows: DiffRow[]; categories: { category: string; a: number; b: number }[]; goalShifts: { name: string; months: number | null }[] } {
  const at = (p: typeof A) => p.points[Math.min(horizon, p.points.length - 1)]?.likely ?? 0;
  const rows: DiffRow[] = [
    { key: "bal", label: `Balance in ${horizon} months`, a: at(A), b: at(B), kind: "money", changed: at(A) !== at(B), better: at(B) > at(A) },
    { key: "surplus", label: "Monthly surplus", a: A.plan.surplus, b: B.plan.surplus, kind: "money", changed: A.plan.surplus !== B.plan.surplus, better: B.plan.surplus > A.plan.surplus },
    { key: "income", label: "Monthly income", a: A.plan.income, b: B.plan.income, kind: "money", changed: A.plan.income !== B.plan.income, better: B.plan.income > A.plan.income },
    { key: "fixed", label: "Fixed costs / month", a: A.plan.fixed, b: B.plan.fixed, kind: "money", changed: A.plan.fixed !== B.plan.fixed, better: B.plan.fixed < A.plan.fixed },
    { key: "variable", label: "Variable spend / month", a: A.plan.variable, b: B.plan.variable, kind: "money", changed: A.plan.variable !== B.plan.variable, better: B.plan.variable < A.plan.variable },
  ];
  const goalShifts: { name: string; months: number | null }[] = [];
  for (const gb of B.goals) {
    const ga = A.goals.find((g) => g.goal.id === gb.goal.id);
    const pa = ga?.projected ?? null;
    const pb = gb.projected;
    const shift = pa && pb ? monthsApart(pa, pb) : pa === pb ? 0 : null;
    goalShifts.push({ name: gb.goal.name, months: shift });
    rows.push({ key: `goal_${gb.goal.id}`, label: `${gb.goal.name} lands`, a: pa, b: pb, kind: "month", changed: pa !== pb, better: pa === pb ? null : !pb ? false : !pa ? true : pb < pa });
  }
  const missed = (p: typeof A) => p.goals.filter((g) => !g.onTrack).map((g) => g.goal.name).join(", ") || "none";
  rows.push({ key: "missed", label: "Goals that miss their date", a: missed(A), b: missed(B), kind: "text", changed: missed(A) !== missed(B), better: null });
  const cats = new Set([...Object.keys(A.plan.byCategory), ...Object.keys(B.plan.byCategory)]);
  const categories = [...cats]
    .map((c) => ({ category: c, a: A.plan.byCategory[c as keyof typeof A.plan.byCategory] ?? 0, b: B.plan.byCategory[c as keyof typeof B.plan.byCategory] ?? 0 }))
    .filter((x) => x.a !== x.b);
  return { rows, categories, goalShifts };
}
