"use client";
import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { useStore } from "@/lib/store";
import { chainAssumptions, useDerived } from "@/lib/derived";
import { useUi } from "@/lib/ui";
import { callApi } from "@/lib/api";
import { APP_TODAY } from "@/lib/config";
import { formatINR, monthLabel, uid } from "@/lib/format";
import {
  fallbackPlanner,
  MAX_TOOL_CALLS,
  runInvestigation,
  type InvestigateCtx,
  type Investigation,
  type PlannerInput,
  type PlannerStep,
  type ToolResult,
} from "@/lib/engine/investigate";

/** Own open/close state, so this mode shares nothing with the coach drawer and can be removed on its own. */
export const useInvestigate = create<{ open: boolean; setOpen: (o: boolean) => void }>((set) => ({ open: false, setOpen: (open) => set({ open }) }));

const SUGGESTIONS = ["Why am I falling behind on the bike goal?", "What is eating into my surplus?", "Can I get the laptop sooner?"];

const fmtArgs = (a: Record<string, unknown>) =>
  Object.entries(a)
    .filter(([, v]) => v != null && v !== "" && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.length} assumption${v.length === 1 ? "" : "s"}]` : JSON.stringify(v)}`)
    .join(", ");

export function InvestigateDrawer() {
  const open = useInvestigate((u) => u.open);
  const setOpen = useInvestigate((u) => u.setOpen);
  const s = useStore();
  const d = useDerived();
  const showProvenance = useUi((u) => u.showProvenance);
  const showToast = useUi((u) => u.showToast);
  const [q, setQ] = useState("");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<ToolResult[]>([]);
  const [result, setResult] = useState<Investigation | null>(null);
  const [usedModel, setUsedModel] = useState(false);
  const [approved, setApproved] = useState<string | null>(null);
  const run = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !useUi.getState().provenance) setOpen(false);
    };
    // capture phase: runs before the shell's Escape handler closes the provenance drawer, so Escape closes one layer at a time
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [setOpen]);

  if (!open) return null;

  async function investigate(text: string) {
    if (!text.trim() || busy) return;
    const my = ++run.current;
    setBusy(true);
    setQuestion(text);
    setSteps([]);
    setResult(null);
    setApproved(null);
    setUsedModel(false);
    const ctx: InvestigateCtx = {
      txns: d.categorized,
      recurring: d.recurring,
      baseline: d.baseline,
      goals: s.goals,
      profile: s.profile,
      mainAssumptions: chainAssumptions(s.scenarios, "main"),
      advice: s.advice,
      today: APP_TODAY,
    };
    const fallback = fallbackPlanner(ctx);
    let offline = false;
    const planner = async (input: PlannerInput): Promise<PlannerStep> => {
      if (offline) return fallback(input);
      const res = await callApi<PlannerStep | { type: "fallback" }>("investigate", {
        question: input.question,
        mustConclude: input.mustConclude,
        steps: input.steps.map((x) => ({ tool: x.tool, args: x.args, data: x.data })),
        context: { today: APP_TODAY, goals: s.goals.map((g) => ({ id: g.id, name: g.name })) },
      });
      if (!res.ok || !res.data || res.data.type === "fallback") {
        offline = true;
        return fallback(input);
      }
      setUsedModel(true);
      return res.data;
    };
    const out = await runInvestigation(ctx, text, planner, (r) => {
      if (run.current === my) setSteps((xs) => [...xs, r]);
    });
    if (run.current !== my) return;
    setResult(out);
    setBusy(false);
    setQ("");
  }

  function approve() {
    const p = result?.proposal;
    if (!p) return;
    if (p.kind === "scenario") {
      s.upsertScenario({ id: uid("sc"), name: p.draft.name, parent_id: "main", assumptions: p.draft.assumptions, created_at: new Date().toISOString(), is_main: false });
      setApproved(`Scenario “${p.draft.name}” created. Open Scenarios to edit or compare it.`);
      showToast(`Scenario “${p.draft.name}” created`);
    } else {
      const added = s.addLiveAdvice([{ advice: p.advice, evidence: p.evidence }]);
      setApproved(added ? "Written to your advice history. The Ghost now tracks it." : "That advice is already in your history.");
      showToast(added ? "Advice added" : "Advice already in your history", added ? "ok" : "warn");
    }
  }

  const p = result?.proposal ?? null;
  const saving = p ? (p.kind === "scenario" ? p.draft.surplus_after - p.draft.surplus_before : p.monthly_saving) : 0;

  return (
    <div className="no-print fixed inset-0 z-40 flex justify-end bg-[var(--scrim)]" onClick={() => setOpen(false)}>
      <div className="flex h-full w-[560px] max-w-full flex-col bg-card shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Investigate">
        <div className="flex items-start justify-between border-b border-line p-5">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">Investigation agent</div>
            <h3 className="text-lg font-semibold">Investigate a question</h3>
            <p className="text-xs text-muted">
              The model plans a chain of up to {MAX_TOOL_CALLS} tool calls over RIPPLE&apos;s own engine and proposes one action for you to approve. Every figure is computed
              by the engine.
            </p>
          </div>
          <button onClick={() => setOpen(false)} className="text-muted hover:text-ink" aria-label="Close investigation">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {!question && (
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((x) => (
                <button key={x} onClick={() => investigate(x)} className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:text-ink">
                  {x}
                </button>
              ))}
            </div>
          )}
          {question && <div className="ml-auto w-fit max-w-[85%] rounded-xl bg-ink px-3 py-2 text-sm text-paper">{question}</div>}

          {steps.length > 0 && (
            <ol className="space-y-2" data-testid="investigation-chain">
              {steps.map((st, i) => (
                <li key={i} className="fade-in rounded-lg border border-line p-3" data-testid="investigation-step">
                  <div className="flex items-baseline gap-2">
                    <span className="num text-xs text-faint">{i + 1}</span>
                    <code className="text-xs font-medium text-ink">
                      {st.tool}({fmtArgs(st.args)})
                    </code>
                  </div>
                  <div className={`mt-1 text-sm ${st.error ? "text-warn" : ""}`}>{st.finding}</div>
                  <div className="mt-1 text-xs">
                    {st.ids.length ? (
                      <button className="text-accent underline-offset-2 hover:underline" onClick={() => showProvenance(`Step ${i + 1}: ${st.tool}`, st.ids, st.finding)}>
                        {st.ids.length} row{st.ids.length === 1 ? "" : "s"} touched
                      </button>
                    ) : (
                      <span className="text-faint">computed from your plan, no rows</span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}

          {busy && (
            <div className="flex items-center gap-2 text-xs text-muted" aria-busy="true">
              <span className="skeleton inline-block h-3 w-3 rounded-full" />
              {steps.length >= MAX_TOOL_CALLS ? "Concluding with what it has…" : `Planning step ${steps.length + 1}…`}
            </div>
          )}

          {result && (
            <div className="space-y-3" data-testid="investigation-result">
              {result.capped && <div className="text-xs text-muted">Reached the {MAX_TOOL_CALLS}-call cap and concluded with what it had.</div>}
              <div className="rounded-xl bg-paper px-4 py-3 text-sm leading-relaxed">{result.explanation}</div>
              {p && (
                <div className="rounded-xl border border-accent/40 bg-accent-soft/40 p-4 text-sm" data-testid="investigation-proposal">
                  <div className="text-xs uppercase tracking-wide text-accent">Proposed action · needs your approval</div>
                  {p.kind === "scenario" ? (
                    <>
                      <div className="mt-1 font-medium">New scenario: {p.draft.name}</div>
                      <ul className="mt-1 list-disc pl-5 text-xs text-muted">
                        {p.draft.lines.map((l) => (
                          <li key={l}>{l}</li>
                        ))}
                      </ul>
                      <div className="num mt-2 text-xs">
                        Surplus {formatINR(p.draft.surplus_before)} → {formatINR(p.draft.surplus_after)}/month
                        {p.draft.goals
                          .filter((g) => g.before !== g.after)
                          .map((g) => ` · ${g.name} ${g.before ? monthLabel(g.before) : "—"} → ${g.after ? monthLabel(g.after) : "—"}`)
                          .join("")}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="mt-1 font-medium">Add to your advice: {p.label}</div>
                      <div className="num mt-1 text-xs">Saves about {formatINR(p.monthly_saving)}/month (priced by RIPPLE&apos;s engine)</div>
                    </>
                  )}
                  {(p.kind === "scenario" ? p.ids : p.evidence).length > 0 && (
                    <button
                      className="mt-2 text-xs text-accent underline-offset-2 hover:underline"
                      onClick={() =>
                        showProvenance("Proposed action", p.kind === "scenario" ? p.ids : p.evidence, saving > 0 ? `Changes monthly surplus by ${formatINR(saving, { sign: true })}` : undefined)
                      }
                    >
                      Rows behind it
                    </button>
                  )}
                  <div className="mt-3 flex gap-2">
                    {approved ? (
                      <span className="text-xs text-accent" role="status">
                        {approved}
                      </span>
                    ) : (
                      <>
                        <button onClick={approve} className="rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-paper hover:opacity-90">
                          {p.kind === "scenario" ? "Create scenario" : "Add to advice"}
                        </button>
                        <button onClick={() => setApproved("Dismissed. Nothing was changed.")} className="rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:text-ink">
                          Dismiss
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
              <div className="text-[10px] text-muted">{usedModel ? "Chain planned by the model, every figure by RIPPLE" : "Model unavailable: fixed fallback chain, every figure by RIPPLE"}</div>
            </div>
          )}
        </div>

        <form
          className="flex gap-2 border-t border-line p-4"
          onSubmit={(e) => {
            e.preventDefault();
            investigate(q);
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ask why something is happening…"
            className="flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm"
            aria-label="Investigation question"
          />
          <button disabled={busy} className="rounded-lg bg-ink px-4 text-sm text-paper disabled:opacity-50">
            Investigate
          </button>
        </form>
      </div>
    </div>
  );
}
