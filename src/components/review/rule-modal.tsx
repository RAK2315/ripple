"use client";
import { useMemo, useState } from "react";
import { CATEGORIES } from "../../../contract/types";
import type { Category, Rule, RuleType, Transaction } from "@/lib/types";
import { previewRule, ruleToEnglish } from "@/lib/engine/categorize";
import { useStore } from "@/lib/store";
import { useUi } from "@/lib/ui";
import { dateLabel, formatINR, uid } from "@/lib/format";

export interface Proposal {
  type: RuleType;
  pattern: string;
  amount_min?: number;
  amount_max?: number;
  day_of_month?: number;
  rationale?: string;
}

export function RuleModal({
  source,
  category,
  proposal,
  categorized,
  usedModel,
  onClose,
}: {
  source: Transaction;
  category: Category;
  proposal: Proposal | null;
  categorized: Transaction[];
  usedModel: boolean;
  onClose: () => void;
}) {
  const addRule = useStore((s) => s.addRule);
  const toast = useUi((s) => s.showToast);
  const [edit, setEdit] = useState<Proposal | null>(null);
  const [cat, setCat] = useState<Category>(category);
  const p = edit ?? proposal;
  const rule: Rule | null = p
    ? { id: "preview", ...p, category: cat, learned_from_transaction_id: source.id, created_at: new Date().toISOString(), active: true }
    : null;
  const preview = useMemo(() => (rule ? previewRule(rule, categorized) : null), [rule, categorized]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/30" onClick={onClose}>
      <div className="card w-[640px] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="text-xs uppercase tracking-wide text-accent">Learned rule {usedModel ? "· proposed by the model" : "· proposed by heuristic"}</div>
        <h3 className="mt-1 text-lg font-semibold">You fixed one row. Should RIPPLE learn this?</h3>
        <p className="mt-1 text-sm text-muted">
          From: <span className="font-mono text-xs">{source.raw_description}</span>
        </p>

        {!p && <div className="mt-6 animate-pulse text-sm text-accent">Asking the model for a general rule…</div>}
        {p && rule && preview && (
          <>
            <div className="mt-5 rounded-xl bg-accent-soft p-4 text-[15px] font-medium leading-snug text-ink">{ruleToEnglish(rule)}</div>
            {p.rationale && <p className="mt-2 text-xs text-muted">{p.rationale}</p>}

            <div className="mt-4 grid grid-cols-[1fr_2fr_1fr] gap-2 text-sm">
              <select value={p.type} onChange={(e) => setEdit({ ...p, type: e.target.value as RuleType })} className="rounded-lg border border-line px-2 py-1.5">
                <option value="contains">contains</option>
                <option value="merchant_equals">merchant equals</option>
                <option value="amount_range">amount range + text</option>
                <option value="recurring_date">recurring on date</option>
              </select>
              <input value={p.pattern} onChange={(e) => setEdit({ ...p, pattern: e.target.value.toUpperCase() })} className="rounded-lg border border-line px-2 py-1.5 font-mono" />
              <select value={cat} onChange={(e) => setCat(e.target.value as Category)} className="rounded-lg border border-line px-2 py-1.5">
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              {p.type === "amount_range" && (
                <div className="col-span-3 flex gap-2">
                  <input type="number" placeholder="min ₹" value={p.amount_min != null ? p.amount_min / 100 : ""} onChange={(e) => setEdit({ ...p, amount_min: +e.target.value * 100 })} className="w-32 rounded-lg border border-line px-2 py-1.5" />
                  <input type="number" placeholder="max ₹" value={p.amount_max != null ? p.amount_max / 100 : ""} onChange={(e) => setEdit({ ...p, amount_max: +e.target.value * 100 })} className="w-32 rounded-lg border border-line px-2 py-1.5" />
                </div>
              )}
              {p.type === "recurring_date" && (
                <input type="number" placeholder="day of month" value={p.day_of_month ?? ""} onChange={(e) => setEdit({ ...p, day_of_month: +e.target.value })} className="col-span-3 w-40 rounded-lg border border-line px-2 py-1.5" />
              )}
            </div>

            <div className="mt-4 text-sm">
              This matches <b className="num">{preview.matched.length}</b> past transaction{preview.matched.length === 1 ? "" : "s"}
              {preview.changed.length > 0 && (
                <>
                  , <b className="num text-accent">{preview.changed.length}</b> will be updated
                </>
              )}
              .
            </div>
            <ul className="mt-2 max-h-36 overflow-y-auto rounded-lg bg-paper p-2 text-xs">
              {preview.matched.slice(0, 20).map((t) => (
                <li key={t.id} className="flex justify-between gap-2 py-0.5">
                  <span className="truncate font-mono text-muted">{t.raw_description}</span>
                  <span className="num shrink-0">
                    {dateLabel(t.date)} · {formatINR(t.amount)} · <span className={t.category !== cat ? "text-warn" : "text-accent"}>{t.category}</span>
                  </span>
                </li>
              ))}
            </ul>
            {preview.matched.length > 60 && <p className="mt-2 text-xs text-danger">This rule looks too broad. Make the text more specific.</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm">
                Just this row
              </button>
              <button
                disabled={!p.pattern.trim() || preview.matched.length === 0}
                onClick={() => {
                  addRule({ ...rule, id: uid("rule") });
                  toast(`Rule learned. ${preview.changed.length} past transaction${preview.changed.length === 1 ? "" : "s"} now ${cat}.`);
                  onClose();
                }}
                className="rounded-lg bg-ink px-4 py-2 text-sm text-white disabled:opacity-40"
              >
                Learn rule & apply to history
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
