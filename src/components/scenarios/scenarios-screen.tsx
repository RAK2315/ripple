"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { chainAssumptions, useDerived } from "@/lib/derived";
import { callApi } from "@/lib/api";
import { APP_TODAY } from "@/lib/config";
import { convertRaw, describeAssumption, scenarioDiff, type DiffRow } from "@/lib/engine/scenario";
import type { RawAssumption } from "@/lib/scenario-parse";
import type { Assumption, Scenario } from "@/lib/types";
import { formatINR, monthLabelLong, uid } from "@/lib/format";
import { Timeline, buildTimeline } from "@/components/flow/timeline";
import { AddAssumption, AssumptionEditor, blankAssumption } from "./assumption-editor";
import { useUi } from "@/lib/ui";

const DEMO_SENTENCE = "what if rent goes up by 6000 and I cut eating out by a third";
const EXAMPLES = [DEMO_SENTENCE, "what if I quit my job in March", "what if I drop cult.fit", "what if my salary goes up 10%"];

interface Draft {
  name: string;
  parent_id: string;
  assumptions: Assumption[];
  source: "model" | "rules" | "manual";
  text: string;
}

export function ScenariosScreen() {
  const s = useStore();
  const d = useDerived();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [compareA, setCompareA] = useState("main");
  const selectedB = s.activeScenarioId;

  const A = useMemo(() => d.projectFor(compareA), [d, compareA]);
  const B = d.active;
  const diff = useMemo(() => scenarioDiff(A, B), [A, B]);
  const rows = useMemo(() => buildTimeline(d.history, B, compareA !== selectedB ? A : undefined), [d.history, A, B, compareA, selectedB]);
  const nameOf = (id: string) => s.scenarios.find((x) => x.id === id)?.name ?? id;

  if (s.transactions.length === 0) {
    return (
      <div className="card mx-auto mt-16 max-w-xl p-10 text-center">
        <h1 className="text-xl font-semibold">Scenarios branch from your real data.</h1>
        <p className="mt-2 text-muted">Import transactions first, then ask “what if”.</p>
        <Link href="/import" className="mt-5 inline-block rounded-lg bg-ink px-5 py-3 text-sm text-paper">
          Import transactions
        </Link>
      </div>
    );
  }

  async function build(sentence: string) {
    if (!sentence.trim()) return;
    setBusy(true);
    const res = await callApi<{ name: string; assumptions: RawAssumption[] }>("scenario", {
      text: sentence,
      recurring: d.recurring.filter((r) => r.direction === "debit").map((r) => ({ id: r.id, merchant: r.merchant_normalized, category: r.category })),
      goals: s.goals.map((g) => ({ id: g.id, name: g.name })),
      categoriesWithSpend: Object.keys(d.main.plan.byCategory),
      today: APP_TODAY,
    });
    setBusy(false);
    const raw = res.ok && res.data ? res.data.assumptions : [];
    const assumptions = convertRaw(raw, { recurring: d.recurring, income: d.baseline.income, today: APP_TODAY });
    if (!assumptions.length) useUi.getState().showToast("Couldn't read that sentence. Add the assumptions by hand below.", "warn");
    setDraft({
      name: res.data?.name || sentence.replace(/^what if\s*/i, "").slice(0, 40),
      parent_id: selectedB,
      assumptions,
      source: res.usedModel ? "model" : "rules",
      text: sentence,
    });
  }

  function run() {
    if (!draft) return;
    const sc: Scenario = { id: uid("sc"), name: draft.name || "Untitled", parent_id: draft.parent_id, assumptions: draft.assumptions, created_at: new Date().toISOString(), is_main: false };
    s.upsertScenario(sc);
    s.setActiveScenario(sc.id);
    setCompareA(draft.parent_id);
    setDraft(null);
    setText("");
  }

  const current = s.scenarios.find((x) => x.id === selectedB);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Scenarios</h1>
        <p className="text-sm text-muted">Branch the future. The model only reads your sentence into parameters you can edit; every number below is computed from your transactions.</p>
      </div>

      <div className="card p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            build(text);
          }}
          className="flex gap-3"
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What if… (e.g. rent goes up by 6000 and I cut eating out by a third)"
            className="flex-1 rounded-lg border border-line px-4 py-3 text-base"
            aria-label="What if sentence"
          />
          <button disabled={busy} className="rounded-lg bg-ink px-5 text-sm text-paper disabled:opacity-50">
            {busy ? "Reading…" : "Build scenario"}
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((e) => (
            <button key={e} onClick={() => setText(e)} className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:text-ink">
              {e}
            </button>
          ))}
          <button
            onClick={() => setDraft({ name: "", parent_id: selectedB, assumptions: [], source: "manual", text: "" })}
            className="rounded-full border border-dashed border-line px-3 py-1 text-xs text-muted hover:text-ink"
          >
            + build by hand
          </button>
        </div>

        {draft && (
          <div className="mt-5 rounded-xl border-2 border-accent/40 bg-accent-soft/30 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-medium uppercase tracking-wide text-accent">
                {draft.source === "model" ? "Read by AI · check before running" : draft.source === "rules" ? "Read offline by pattern rules · check before running" : "New scenario"}
              </span>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Scenario name"
                className="rounded-md border border-line bg-raised px-2 py-1 text-sm font-medium"
                aria-label="Scenario name"
              />
              <label className="flex items-center gap-1 text-xs text-muted">
                branches from
                <select value={draft.parent_id} onChange={(e) => setDraft({ ...draft, parent_id: e.target.value })} className="rounded-md border border-line bg-raised px-2 py-1 text-sm">
                  {s.scenarios.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-3 space-y-2">
              {draft.assumptions.map((a, i) => (
                <AssumptionEditor
                  key={i}
                  a={a}
                  goals={s.goals}
                  recurring={d.recurring}
                  onChange={(na) => setDraft({ ...draft, assumptions: draft.assumptions.map((x, j) => (j === i ? na : x)) })}
                  onRemove={() => setDraft({ ...draft, assumptions: draft.assumptions.filter((_, j) => j !== i) })}
                />
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <AddAssumption onAdd={(k) => setDraft({ ...draft, assumptions: [...draft.assumptions, blankAssumption(k, s.goals, d.recurring, APP_TODAY)] })} />
              <div className="ml-auto flex gap-2">
                <button onClick={() => setDraft(null)} className="rounded-lg border border-line px-4 py-2 text-sm">
                  Discard
                </button>
                <button onClick={run} disabled={!draft.assumptions.length} className="rounded-lg bg-accent px-4 py-2 text-sm text-paper disabled:opacity-40">
                  Run scenario
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-[240px_1fr] gap-6">
        <div className="card h-fit p-4">
          <div className="mb-2 text-xs uppercase tracking-wide text-muted">Branches</div>
          <ScenarioTree scenarios={s.scenarios} active={selectedB} onSelect={s.setActiveScenario} onDelete={s.deleteScenario} />
        </div>

        <div className="space-y-6">
          <div className="card p-6">
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">Compare</span>
              <select value={compareA} onChange={(e) => setCompareA(e.target.value)} className="rounded-md border border-line px-2 py-1">
                {s.scenarios.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
              <span className="text-muted">with</span>
              <select value={selectedB} onChange={(e) => s.setActiveScenario(e.target.value)} className="rounded-md border border-line px-2 py-1 font-medium">
                {s.scenarios.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </div>
            {compareA === selectedB ? (
              <p className="text-sm text-muted">Pick two different scenarios to see what changes. Build one above.</p>
            ) : (
              <>
                {diff.goalShifts.some((g) => g.months) && (
                  <div className="mb-4 rounded-lg bg-paper px-4 py-3 text-sm">
                    {diff.goalShifts
                      .filter((g) => g.months)
                      .map((g) => (
                        <span key={g.name} className="mr-4">
                          <b>{g.name}</b>{" "}
                          {g.months == null ? (
                            <span className="text-danger">is no longer reached</span>
                          ) : g.months > 0 ? (
                            <span className="text-danger">
                              lands {g.months} month{g.months > 1 ? "s" : ""} later
                            </span>
                          ) : (
                            <span className="text-accent">
                              lands {-g.months} month{g.months < -1 ? "s" : ""} sooner
                            </span>
                          )}
                        </span>
                      ))}
                  </div>
                )}
                <table className="w-full text-sm" data-testid="diff-table">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th className="pb-2 font-normal" />
                      <th className="pb-2 text-right font-normal">{nameOf(compareA)}</th>
                      <th className="pb-2 text-right font-medium text-ink">{nameOf(selectedB)}</th>
                      <th className="pb-2 text-right font-normal">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diff.rows.map((r) => (
                      <DiffLine key={r.key} r={r} />
                    ))}
                  </tbody>
                </table>
                {diff.categories.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    {diff.categories.map((c) => (
                      <span key={c.category} className="rounded-full bg-warn-soft px-3 py-1 text-warn">
                        {c.category}: {formatINR(c.a)} → {formatINR(c.b)}/mo
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="card p-6">
            <h2 className="text-lg font-semibold">Balance: {nameOf(selectedB)}</h2>
            <p className="text-xs text-muted">{compareA !== selectedB ? `Dashed grey = ${nameOf(compareA)}. ` : ""}Goal markers show where each goal lands in this branch.</p>
            <Timeline rows={rows} proj={B} compareLabel={compareA !== selectedB ? nameOf(compareA) : undefined} />
          </div>

          {current && !current.is_main && (
            <div className="card p-6">
              <h2 className="text-lg font-semibold">Assumptions in “{current.name}”</h2>
              <p className="mb-3 text-xs text-muted">
                Inherits from: {chainAssumptions(s.scenarios, current.parent_id ?? "main").map((a) => describeAssumption(a, s.goals)).join(" · ") || "main (no changes)"}
              </p>
              <div className="space-y-2">
                {current.assumptions.map((a, i) => (
                  <AssumptionEditor
                    key={i}
                    a={a}
                    goals={s.goals}
                    recurring={d.recurring}
                    onChange={(na) => s.upsertScenario({ ...current, assumptions: current.assumptions.map((x, j) => (j === i ? na : x)) })}
                    onRemove={() => s.upsertScenario({ ...current, assumptions: current.assumptions.filter((_, j) => j !== i) })}
                  />
                ))}
              </div>
              <div className="mt-3">
                <AddAssumption onAdd={(k) => s.upsertScenario({ ...current, assumptions: [...current.assumptions, blankAssumption(k, s.goals, d.recurring, APP_TODAY)] })} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DiffLine({ r }: { r: DiffRow }) {
  const fmt = (v: DiffRow["a"]) => (v == null ? "not reached" : r.kind === "money" ? formatINR(v as number) : r.kind === "month" ? monthLabelLong(v as string) : String(v));
  let delta = "";
  if (r.changed && r.kind === "money") delta = formatINR((r.b as number) - (r.a as number), { sign: true });
  if (r.changed && r.kind === "month") {
    if (r.a && r.b) {
      const m = (+String(r.b).slice(0, 4) - +String(r.a).slice(0, 4)) * 12 + (+String(r.b).slice(5, 7) - +String(r.a).slice(5, 7));
      delta = `${m > 0 ? "+" : ""}${m} mo`;
    } else delta = r.b ? "now reached" : "missed";
  }
  const tone = !r.changed ? "" : r.better === true ? "text-accent" : r.better === false ? "text-danger" : "text-warn";
  return (
    <tr className={`border-t border-line ${r.changed ? "bg-warn-soft/40" : ""}`}>
      <td className="py-2">{r.label}</td>
      <td className="num py-2 text-right text-muted">{fmt(r.a)}</td>
      <td className="num py-2 text-right font-medium">{fmt(r.b)}</td>
      <td className={`num py-2 text-right ${tone}`}>{delta || "—"}</td>
    </tr>
  );
}

function ScenarioTree({ scenarios, active, onSelect, onDelete }: { scenarios: Scenario[]; active: string; onSelect: (id: string) => void; onDelete: (id: string) => void }) {
  const children = (pid: string | null) => scenarios.filter((x) => x.parent_id === pid);
  const render = (sc: Scenario, depth: number): React.ReactNode => (
    <div key={sc.id}>
      <div
        className={`group flex items-center gap-2 rounded-md px-2 py-2 text-sm ${active === sc.id ? "bg-ink text-paper" : "hover:bg-paper"}`}
        style={{ marginLeft: depth * 14 }}
      >
        {depth > 0 && <span className="text-muted">└</span>}
        <button onClick={() => onSelect(sc.id)} className="flex-1 truncate text-left" title={sc.name}>
          {sc.name}
          {!sc.is_main && <span className={`ml-1 text-[11px] ${active === sc.id ? "text-paper/60" : "text-muted"}`}>({sc.assumptions.length})</span>}
        </button>
        {!sc.is_main && (
          <button onClick={() => onDelete(sc.id)} className="hidden text-xs opacity-60 hover:opacity-100 group-hover:block" aria-label={`Delete ${sc.name}`}>
            ✕
          </button>
        )}
      </div>
      {children(sc.id).map((c) => render(c, depth + 1))}
    </div>
  );
  // orphans (parent deleted) render at root under main
  const roots = scenarios.filter((x) => x.parent_id === null || !scenarios.some((p) => p.id === x.parent_id));
  return <div className="space-y-1">{roots.map((r) => render(r, r.is_main ? 0 : 1))}</div>;
}
