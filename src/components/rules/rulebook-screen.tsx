"use client";
import Link from "next/link";
import { useState } from "react";
import { CATEGORIES } from "../../../contract/types";
import type { Category } from "@/lib/types";
import { useDerived } from "@/lib/derived";
import { useStore } from "@/lib/store";
import { useUi } from "@/lib/ui";
import { previewRule, ruleToEnglish } from "@/lib/engine/categorize";
import { dateLabel, formatINR } from "@/lib/format";

export function RulebookScreen() {
  const d = useDerived();
  const rules = useStore((s) => s.rules);
  const update = useStore((s) => s.updateRule);
  const del = useStore((s) => s.deleteRule);
  const show = useUi((s) => s.showProvenance);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Rulebook</h1>
        <p className="text-sm text-muted">
          Everything RIPPLE has learned from your corrections, in plain English. Rules run before the model, in order from newest to oldest. Edit or delete any of
          them.
        </p>
      </div>
      {rules.length === 0 && (
        <div className="card p-8 text-center text-sm text-muted">
          No rules yet. Fix a category on the{" "}
          <Link href="/review" className="underline">
            Review
          </Link>{" "}
          screen and RIPPLE will propose one.
        </div>
      )}
      <div className="space-y-3">
        {rules.map((r) => {
          const src = r.learned_from_transaction_id ? d.byId.get(r.learned_from_transaction_id) : undefined;
          const matched = previewRule(r, d.categorized).matched;
          return (
            <div key={r.id} className={`card p-5 ${r.active ? "" : "opacity-50"}`}>
              <div className="flex items-start justify-between gap-6">
                <div className="flex-1">
                  <div className="text-[15px] font-medium">{ruleToEnglish(r)}</div>
                  <div className="mt-2 text-xs text-muted">
                    Learned {new Date(r.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                    {src && (
                      <>
                        {" "}
                        from <span className="font-mono">{src.raw_description}</span> ({dateLabel(src.date)}, {formatINR(src.amount)})
                      </>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => show(ruleToEnglish(r), matched.map((t) => t.id))}
                  className="num shrink-0 rounded-lg bg-accent-soft px-3 py-2 text-sm font-medium text-accent"
                >
                  {matched.length} matches
                </button>
              </div>
              {editing === r.id && (
                <div className="mt-3 flex gap-2 text-sm">
                  <input value={r.pattern} onChange={(e) => update(r.id, { pattern: e.target.value.toUpperCase() })} className="flex-1 rounded-lg border border-line px-2 py-2 font-mono" />
                  <select value={r.category} onChange={(e) => update(r.id, { category: e.target.value as Category })} className="rounded-lg border border-line px-2 py-2">
                    {CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="mt-3 flex gap-3 text-xs">
                <button onClick={() => setEditing(editing === r.id ? null : r.id)} className="text-muted hover:text-ink">
                  {editing === r.id ? "Done" : "Edit"}
                </button>
                <button onClick={() => update(r.id, { active: !r.active })} className="text-muted hover:text-ink">
                  {r.active ? "Disable" : "Enable"}
                </button>
                <button onClick={() => del(r.id)} className="text-danger">
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
