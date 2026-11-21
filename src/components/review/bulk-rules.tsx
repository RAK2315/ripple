"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useUi } from "@/lib/ui";
import { callApi } from "@/lib/api";
import { previewRule } from "@/lib/engine/categorize";
import { allCategories, findMerchant, merchantList, parseInstruction, resolveCategory, validateModelRules, type BulkRuleDraft } from "@/lib/engine/bulk-rules";
import { uid } from "@/lib/format";
import type { Category, Rule, Transaction } from "@/lib/types";

const EXAMPLE = "put all entries of Maheshwari Mart and Pintu Kumar as stationery";

/** Turns plain-language instructions into rules. Always previewed and editable; nothing applies until Confirm. */
export function BulkRules({ categorized }: { categorized: Transaction[] }) {
  const custom = useStore((s) => s.customCategories);
  const addRule = useStore((s) => s.addRule);
  const addCategories = useStore((s) => s.addCategories);
  const toast = useUi((u) => u.showToast);
  const showProvenance = useUi((u) => u.showProvenance);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<BulkRuleDraft[] | null>(null);
  const [unresolved, setUnresolved] = useState<string[]>([]);
  const [source, setSource] = useState<"model" | "parser">("parser");
  const [instruction, setInstruction] = useState("");

  const categories = useMemo(() => allCategories(custom), [custom]);
  const merchants = useMemo(() => merchantList(categorized).map((m) => m.merchant), [categorized]);
  const ruleOf = (d: BulkRuleDraft): Rule => ({
    id: "preview",
    type: "merchant_equals",
    pattern: d.merchant.toUpperCase(),
    category: d.category as Category,
    learned_from_transaction_id: null,
    created_at: new Date().toISOString(),
    active: true,
    source: "instruction",
    instruction,
  });
  const previews = useMemo(() => (drafts ?? []).map((d) => previewRule(ruleOf(d), categorized)), [drafts, categorized]); // eslint-disable-line react-hooks/exhaustive-deps

  async function read() {
    if (!text.trim()) return;
    setBusy(true);
    setInstruction(text.trim());
    const det = parseInstruction(text, merchants, categories);
    const res = await callApi<{ rules: { merchant: string; category: string }[]; unresolved: string[] } | null>("bulk-rules", { text, merchants, categories });
    let rules = det.rules;
    let open = det.unresolved;
    if (res.ok && res.data) {
      const fromModel = validateModelRules(res.data.rules, merchants, categories);
      // union: the model reads messier phrasing; our parser catches anything it skipped. Only real merchants survive.
      rules = [...fromModel.rules, ...det.rules.filter((r) => !fromModel.rules.some((m) => m.merchant === r.merchant))];
      open = [...new Set([...fromModel.unresolved, ...(res.data.unresolved ?? [])])].filter((u) => u && !findMerchantIn(u, rules));
      setSource("model");
    } else setSource("parser");
    setDrafts(rules);
    setUnresolved(open);
    setBusy(false);
  }

  const findMerchantIn = (phrase: string, rules: BulkRuleDraft[]) => !!findMerchant(phrase, rules.map((r) => r.merchant));

  function edit(i: number, patch: Partial<BulkRuleDraft>) {
    setDrafts((ds) =>
      (ds ?? []).map((d, k) => {
        if (k !== i) return d;
        const next = { ...d, ...patch };
        if (patch.category !== undefined) next.isNew = !categories.some((c) => c.toLowerCase() === patch.category!.trim().toLowerCase());
        return next;
      }),
    );
  }

  function confirm() {
    const ds = (drafts ?? []).filter((d) => d.merchant.trim() && d.category.trim());
    if (!ds.length) return;
    const fresh = [...new Set(ds.map((d) => resolveCategory(d.category, categories)).filter((c) => c?.isNew).map((c) => c!.category))];
    if (fresh.length) addCategories(fresh);
    let changed = 0;
    ds.forEach((d, i) => {
      const cat = resolveCategory(d.category, [...categories, ...fresh])!.category;
      addRule({ ...ruleOf({ ...d, category: cat }), id: uid("rule") });
      changed += previews[i]?.changed.length ?? 0;
    });
    toast(`${ds.length} rule${ds.length === 1 ? "" : "s"} saved${fresh.length ? `, new categor${fresh.length === 1 ? "y" : "ies"}: ${fresh.join(", ")}` : ""}. ${changed} past transaction${changed === 1 ? "" : "s"} recategorized.`);
    setDrafts(null);
    setUnresolved([]);
    setText("");
  }

  return (
    <div className="card space-y-3 p-5" data-testid="bulk-rules">
      <div>
        <h2 className="font-semibold">Tell RIPPLE how to categorize, in your words</h2>
        <p className="text-xs text-muted">
          One sentence can make several rules, and can create a new category. You see every rule and how many rows it matches before anything changes.
        </p>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          read();
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`e.g. ${EXAMPLE}`}
          className="flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm"
          aria-label="Categorization instruction"
        />
        <button disabled={busy || !text.trim()} className="rounded-lg bg-ink px-4 text-sm text-paper disabled:opacity-50">
          {busy ? "Reading…" : "Make rules"}
        </button>
      </form>

      {drafts && (
        <div className="space-y-2" data-testid="bulk-preview">
          {drafts.length === 0 && <p className="text-sm text-warn">No rules: nothing in that instruction matched a merchant in your data.</p>}
          {drafts.map((d, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto_auto] items-center gap-2 rounded-lg bg-paper px-3 py-2 text-sm" data-testid="bulk-rule">
              <select value={d.merchant} onChange={(e) => edit(i, { merchant: e.target.value })} className="rounded-md border border-line bg-card px-2 py-1" aria-label="Merchant">
                {[d.merchant, ...merchants.filter((m) => m !== d.merchant)].slice(0, 200).map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
              <span className="text-muted">→</span>
              <span className="flex items-center gap-2">
                <input
                  value={d.category}
                  onChange={(e) => edit(i, { category: e.target.value })}
                  list="bulk-categories"
                  className="w-full rounded-md border border-line bg-card px-2 py-1"
                  aria-label="Category"
                />
                {d.isNew && <span className="whitespace-nowrap rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent">new category</span>}
              </span>
              <button
                className="num whitespace-nowrap text-xs text-accent underline-offset-2 hover:underline"
                onClick={() => showProvenance(`${d.merchant} → ${d.category}`, previews[i]?.matched.map((t) => t.id) ?? [])}
                data-testid="bulk-matches"
              >
                matches {previews[i]?.matched.length ?? 0} row{previews[i]?.matched.length === 1 ? "" : "s"}
              </button>
              <button onClick={() => setDrafts((ds) => (ds ?? []).filter((_, k) => k !== i))} className="text-xs text-muted hover:text-danger" aria-label={`Remove rule for ${d.merchant}`}>
                ✕
              </button>
            </div>
          ))}
          <datalist id="bulk-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          {unresolved.length > 0 && (
            <p className="text-xs text-warn" data-testid="bulk-unresolved">
              Couldn&apos;t match to anything in your data, so no rule was made: {unresolved.map((u) => `“${u}”`).join(", ")}.
            </p>
          )}
          <div className="flex items-center gap-2">
            <button onClick={confirm} disabled={!drafts.length} className="rounded-lg bg-ink px-4 py-1.5 text-sm text-paper disabled:opacity-40">
              Confirm {drafts.length} rule{drafts.length === 1 ? "" : "s"}
            </button>
            <button onClick={() => setDrafts(null)} className="rounded-lg border border-line px-4 py-1.5 text-sm text-muted">
              Cancel
            </button>
            <span className="ml-auto text-[10px] text-muted">{source === "model" ? "Read by the model, checked against your data" : "Read by RIPPLE's own parser (model unavailable)"}</span>
          </div>
        </div>
      )}
    </div>
  );
}
