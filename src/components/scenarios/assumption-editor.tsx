"use client";
import { CATEGORIES } from "../../../contract/types";
import type { Assumption, Category, Goal, Recurring } from "@/lib/types";

const KINDS: { kind: Assumption["kind"]; label: string }[] = [
  { kind: "category_pct", label: "Category ± %" },
  { kind: "category_abs", label: "Category ± ₹/month" },
  { kind: "category_set", label: "Category = ₹/month" },
  { kind: "income_change", label: "Income ± ₹/month" },
  { kind: "one_off", label: "One-off expense" },
  { kind: "add_recurring", label: "New monthly cost" },
  { kind: "remove_recurring", label: "Drop a recurring payment" },
  { kind: "goal_change", label: "Change a goal" },
];

export function blankAssumption(kind: Assumption["kind"], goals: Goal[], recurring: Recurring[], today: string): Assumption {
  switch (kind) {
    case "category_pct":
      return { kind, category: "Dining", pct: -10 };
    case "category_abs":
      return { kind, category: "Rent", amount: 0 };
    case "category_set":
      return { kind, category: "Rent", amount: 0 };
    case "income_change":
      return { kind, amount: 0 };
    case "one_off":
      return { kind, label: "One-off", amount: 0, date: today };
    case "add_recurring":
      return { kind, label: "New cost", amount: 0 };
    case "remove_recurring": {
      const r = recurring.find((x) => x.direction === "debit");
      return { kind, label: r?.merchant_normalized ?? "", amount: r?.monthly_amount ?? 0, recurring_id: r?.id };
    }
    case "goal_change":
      return { kind, goal_id: goals[0]?.id ?? "", target_date: goals[0]?.target_date };
  }
}

const input = "rounded-md border border-line bg-raised px-2 py-1 text-sm";

/** Editable fields for one assumption. Money is edited in rupees, stored in paise. */
export function AssumptionEditor({
  a,
  onChange,
  onRemove,
  goals,
  recurring,
}: {
  a: Assumption;
  onChange: (a: Assumption) => void;
  onRemove: () => void;
  goals: Goal[];
  recurring: Recurring[];
}) {
  const rupees = (p: number) => Math.round(p / 100);
  const money = (value: number, set: (paise: number) => void, label = "₹") => (
    <label className="flex items-center gap-1 text-xs text-muted">
      {label}
      <input type="number" className={`${input} num w-28`} value={rupees(value)} onChange={(e) => set(Math.round(+e.target.value * 100))} />
    </label>
  );
  const fromField =
    "from" in a || ["category_pct", "category_abs", "category_set", "income_change", "add_recurring", "remove_recurring"].includes(a.kind) ? (
      <label className="flex items-center gap-1 text-xs text-muted">
        from
        <input
          type="month"
          className={input}
          value={("from" in a && a.from) || ""}
          onChange={(e) => onChange({ ...a, from: e.target.value || undefined } as Assumption)}
        />
      </label>
    ) : null;
  const catSelect = (c: Category, set: (c: Category) => void) => (
    <select className={input} value={c} onChange={(e) => set(e.target.value as Category)}>
      {CATEGORIES.map((x) => (
        <option key={x}>{x}</option>
      ))}
    </select>
  );

  let fields: React.ReactNode = null;
  switch (a.kind) {
    case "category_pct":
      fields = (
        <>
          {catSelect(a.category, (category) => onChange({ ...a, category }))}
          <label className="flex items-center gap-1 text-xs text-muted">
            <input type="number" step="0.1" className={`${input} num w-20`} value={a.pct} onChange={(e) => onChange({ ...a, pct: +e.target.value })} />%
          </label>
        </>
      );
      break;
    case "category_abs":
    case "category_set":
      fields = (
        <>
          {catSelect(a.category, (category) => onChange({ ...a, category }))}
          {money(a.amount, (amount) => onChange({ ...a, amount }), a.kind === "category_abs" ? "± ₹" : "= ₹")}
        </>
      );
      break;
    case "income_change":
      fields = money(a.amount, (amount) => onChange({ ...a, amount }), "± ₹");
      break;
    case "one_off":
      fields = (
        <>
          <input className={`${input} w-32`} value={a.label} onChange={(e) => onChange({ ...a, label: e.target.value })} />
          {money(a.amount, (amount) => onChange({ ...a, amount }))}
          <input type="date" className={input} value={a.date} onChange={(e) => onChange({ ...a, date: e.target.value })} />
        </>
      );
      break;
    case "add_recurring":
      fields = (
        <>
          <input className={`${input} w-32`} value={a.label} onChange={(e) => onChange({ ...a, label: e.target.value })} />
          {money(a.amount, (amount) => onChange({ ...a, amount }))}
        </>
      );
      break;
    case "remove_recurring":
      fields = (
        <select
          className={input}
          value={a.recurring_id ?? ""}
          onChange={(e) => {
            const r = recurring.find((x) => x.id === e.target.value);
            if (r) onChange({ ...a, recurring_id: r.id, label: r.merchant_normalized, amount: r.monthly_amount });
          }}
        >
          {recurring
            .filter((r) => r.direction === "debit")
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.merchant_normalized} (₹{rupees(r.monthly_amount)}/mo)
              </option>
            ))}
        </select>
      );
      break;
    case "goal_change":
      fields = (
        <>
          <select className={input} value={a.goal_id} onChange={(e) => onChange({ ...a, goal_id: e.target.value })}>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          {money(a.target_amount ?? goals.find((g) => g.id === a.goal_id)?.target_amount ?? 0, (target_amount) => onChange({ ...a, target_amount }), "target ₹")}
          <input type="date" className={input} value={a.target_date ?? ""} onChange={(e) => onChange({ ...a, target_date: e.target.value || undefined })} />
        </>
      );
      break;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-paper px-3 py-2">
      <span className="w-40 shrink-0 text-xs font-medium">{KINDS.find((k) => k.kind === a.kind)?.label}</span>
      {fields}
      {fromField}
      <button onClick={onRemove} className="ml-auto text-xs text-muted hover:text-danger" aria-label="Remove assumption">
        Remove
      </button>
    </div>
  );
}

export function AddAssumption({ onAdd }: { onAdd: (kind: Assumption["kind"]) => void }) {
  return (
    <select className={`${input} text-muted`} value="" onChange={(e) => e.target.value && onAdd(e.target.value as Assumption["kind"])}>
      <option value="">+ Add assumption…</option>
      {KINDS.map((k) => (
        <option key={k.kind} value={k.kind}>
          {k.label}
        </option>
      ))}
    </select>
  );
}
