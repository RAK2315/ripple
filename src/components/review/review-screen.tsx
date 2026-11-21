"use client";
import { useMemo, useState } from "react";
import { CATEGORIES } from "../../../contract/types";
import type { Category, Transaction } from "@/lib/types";
import { useDerived } from "@/lib/derived";
import { useStore } from "@/lib/store";
import { LOW_CONFIDENCE } from "@/lib/config";
import { callApi } from "@/lib/api";
import { goalImpactDays } from "@/lib/engine/projection";
import { dateLabel, formatINR } from "@/lib/format";
import { RuleModal, type Proposal } from "./rule-modal";

const SOURCE_LABEL: Record<string, string> = { rule: "rule", starter_list: "known merchant", llm: "model", user: "you" };

export function ReviewScreen() {
  const d = useDerived();
  const setOverride = useStore((s) => s.setOverride);
  const [filter, setFilter] = useState<"review" | "all">("review");
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<{ source: Transaction; category: Category; proposal: Proposal | null; usedModel: boolean } | null>(null);

  const rows = useMemo(() => {
    const low = (t: Transaction) => (t.confidence ?? 0) < LOW_CONFIDENCE && t.category_source !== "user";
    let list = [...d.categorized].sort((a, b) => Number(low(b)) - Number(low(a)) || (a.date < b.date ? 1 : -1));
    if (filter === "review") list = list.filter(low);
    if (q) list = list.filter((t) => `${t.raw_description} ${t.merchant_normalized} ${t.category}`.toUpperCase().includes(q.toUpperCase()));
    return list;
  }, [d.categorized, filter, q]);

  const surplus = d.main.plan.surplus;
  const goal = d.main.nearestGoal?.goal.name;

  async function onChange(t: Transaction, category: Category) {
    setModal({ source: t, category, proposal: null, usedModel: false });
    const examples = d.categorized.filter((x) => x.merchant_normalized === t.merchant_normalized && x.id !== t.id).map((x) => x.raw_description);
    const res = await callApi<Proposal>("propose-rule", {
      description: t.raw_description,
      merchant: t.merchant_normalized,
      amount: t.amount,
      date: t.date,
      oldCategory: t.category,
      newCategory: category,
      examples,
    });
    setModal((m) => (m && m.source.id === t.id ? { ...m, proposal: res.data ?? { type: "contains", pattern: (t.merchant_normalized ?? "").toUpperCase() }, usedModel: !!res.usedModel } : m));
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Review</h1>
          <p className="text-sm text-muted">Low-confidence rows are pinned to the top. Fix one, and RIPPLE proposes a rule for all of them.</p>
        </div>
        <div className="flex items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="rounded-lg border border-line bg-card px-3 py-2 text-sm" />
          <div className="flex rounded-lg bg-card p-1 text-sm">
            {(["review", "all"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`rounded-md px-3 py-1 ${filter === f ? "bg-ink text-paper" : "text-muted"}`}>
                {f === "review" ? "Needs review" : "All"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card divide-y divide-line">
        {rows.length === 0 && <div className="p-8 text-center text-sm text-muted">Nothing needs review. Every row is categorized with confidence.</div>}
        {rows.slice(0, 300).map((t) => {
          const low = (t.confidence ?? 0) < LOW_CONFIDENCE && t.category_source !== "user";
          const days = t.direction === "debit" ? goalImpactDays(t.amount, surplus) : null;
          return (
            <div key={t.id} className={`grid grid-cols-[70px_1fr_120px_190px] items-center gap-4 px-5 py-2 ${low ? "bg-warn-soft/50" : ""}`}>
              <div className="text-xs text-muted">{dateLabel(t.date)}</div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{t.merchant_normalized}</div>
                <div className="truncate font-mono text-[11px] text-muted">{t.raw_description}</div>
              </div>
              <div className="text-right">
                <div className={`num text-sm ${t.direction === "credit" ? "text-accent" : ""}`}>
                  {t.direction === "credit" ? "+" : ""}
                  {formatINR(t.amount)}
                </div>
                {days != null && days >= 0.5 && goal && (
                  <div className="text-[10px] text-muted" title="Goal-impact lens: amount ÷ monthly surplus × 30 days">
                    {goal} +{days < 10 ? days.toFixed(1) : Math.round(days)}d
                  </div>
                )}
              </div>
              <div>
                <select
                  value={low ? "" : (t.category ?? "Other")}
                  onChange={(e) => e.target.value && onChange(t, e.target.value as Category)}
                  className={`w-full rounded-lg border px-2 py-1 text-sm ${low ? "border-warn" : "border-line"} bg-card`}
                >
                  {low && <option value="">{(t.confidence ?? 0) > 0 ? `${t.category}?` : "Pick a category"}</option>}
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-muted">
                  <span>
                    {SOURCE_LABEL[t.category_source ?? "llm"]}
                    {t.category_source !== "user" && t.category_source !== "rule" ? ` · ${Math.round((t.confidence ?? 0) * 100)}%` : ""}
                  </span>
                  {low && (t.confidence ?? 0) > 0 && (
                    <button onClick={() => onChange(t, t.category as Category)} className="ml-auto font-medium text-accent hover:underline">
                      Accept
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {modal && (
        <RuleModal
          source={modal.source}
          category={modal.category}
          proposal={modal.proposal}
          usedModel={modal.usedModel}
          categorized={d.categorized}
          onClose={() => {
            // "Just this row" or after a rule: the row itself is pinned to the user's choice
            setOverride(modal.source.id, modal.category);
            setModal(null);
          }}
        />
      )}
    </div>
  );
}
