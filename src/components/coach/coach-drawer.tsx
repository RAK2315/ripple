"use client";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { useDerived } from "@/lib/derived";
import { useUi } from "@/lib/ui";
import { callApi } from "@/lib/api";
import { APP_TODAY, GHOST_ANNUAL_RATE } from "@/lib/config";
import { monthlyToReach, monthsUntil } from "@/lib/engine/coach";
import { ym } from "@/lib/engine/dates";
import { formatINR, monthLabelLong } from "@/lib/format";

interface Turn {
  q: string;
  text: string;
  refused: boolean;
  source: string;
  plan?: { goal: string; target: number; date: string; months: number; plain: number; rated: number; surplus: number };
}

const SUGGESTIONS = ["Which mutual fund should I buy for my bike?", "When can I afford the bike?", "Where is most of my money going?"];

export function CoachDrawer() {
  const open = useUi((u) => u.coach);
  const setOpen = useUi((u) => u.setCoach);
  const s = useStore();
  const d = useDerived();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  if (!open) return null;

  async function ask(question: string) {
    if (!question.trim()) return;
    setBusy(true);
    const named = s.goals.find((g) => question.toLowerCase().includes(g.name.toLowerCase()));
    const gr = (named && d.main.goals.find((x) => x.goal.id === named.id)) || d.main.nearestGoal || d.main.goals[0];
    const g = gr?.goal;
    const months = g ? Math.max(1, monthsUntil(ym(APP_TODAY), g.target_date)) : 12;
    const plain = g ? monthlyToReach(g.target_amount, g.allocated_so_far, months, 0) : 0;
    const rated = g ? monthlyToReach(g.target_amount, g.allocated_so_far, months, GHOST_ANNUAL_RATE) : 0;
    const top = Object.entries(d.main.plan.byCategory).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
    const facts: Record<string, string> = {
      goal_name: g?.name ?? "your goal",
      goal_target: formatINR(g?.target_amount ?? 0),
      goal_date: g ? monthLabelLong(ym(g.target_date)) : "—",
      goal_projected: gr?.projected ? monthLabelLong(gr.projected) : "not reached at this surplus",
      monthly_plain: formatINR(plain),
      surplus: formatINR(d.main.plan.surplus),
      income: formatINR(d.main.plan.income),
      fixed: formatINR(d.main.plan.fixed),
      variable: formatINR(d.main.plan.variable),
      top_category: top?.[0] ?? "—",
      top_category_amount: formatINR(top?.[1] ?? 0),
    };
    const res = await callApi<{ refused: boolean; text: string; source: string }>("coach", { question, facts });
    const data = res.data ?? { refused: false, text: "Something went wrong reaching the coach. Your numbers are unchanged.", source: "error" };
    if (data.refused) s.logRefusal(question);
    setTurns((t) => [
      ...t,
      {
        q: question,
        ...data,
        plan: data.refused && g ? { goal: g.name, target: g.target_amount, date: g.target_date, months, plain, rated, surplus: d.main.plan.surplus } : undefined,
      },
    ]);
    setQ("");
    setBusy(false);
  }

  return (
    <div className="no-print fixed inset-0 z-40 flex justify-end bg-ink/20" onClick={() => setOpen(false)}>
      <div className="flex h-full w-[520px] flex-col bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-line p-5">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">Coach</div>
            <h3 className="text-lg font-semibold">Ask RIPPLE about your money</h3>
            <p className="text-xs text-muted">Educates and models. Never recommends a specific fund, stock or insurance product. Every figure is computed.</p>
          </div>
          <button onClick={() => setOpen(false)} className="text-muted hover:text-ink" aria-label="Close coach">
            ✕
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {turns.length === 0 && (
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((x) => (
                <button key={x} onClick={() => ask(x)} className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:text-ink">
                  {x}
                </button>
              ))}
            </div>
          )}
          {turns.map((t, i) => (
            <div key={i} className="space-y-2" data-testid="coach-turn">
              <div className="ml-auto w-fit max-w-[85%] rounded-xl bg-ink px-3 py-2 text-sm text-white">{t.q}</div>
              {t.refused && (
                <div className="text-xs font-medium uppercase tracking-wide text-danger" data-testid="refusal">
                  Outside what RIPPLE does · logged
                </div>
              )}
              <div className="rounded-xl bg-paper px-4 py-3 text-sm leading-relaxed">{t.text}</div>
              {t.plan && (
                <div className="rounded-xl border border-accent/40 bg-accent-soft/40 p-4 text-sm">
                  <div className="text-xs uppercase tracking-wide text-accent">What it takes, computed</div>
                  <div className="mt-1">
                    {t.plan.goal}: {formatINR(t.plan.target)} by {monthLabelLong(ym(t.plan.date))} ({t.plan.months} months)
                  </div>
                  <div className="num mt-2 text-2xl font-semibold">
                    {formatINR(t.plan.plain)}
                    <span className="text-sm font-normal text-muted">/month, saving alone</span>
                  </div>
                  <div className="num text-sm text-muted">
                    {formatINR(t.plan.rated)}/month if it earned {GHOST_ANNUAL_RATE * 100}% a year (an illustrative rate, not a product)
                  </div>
                  <div className="mt-2 text-xs">
                    Your surplus is {formatINR(t.plan.surplus)}/month:{" "}
                    {t.plan.surplus >= t.plan.plain ? (
                      <span className="text-accent">enough, with {formatINR(t.plan.surplus - t.plan.plain)} to spare.</span>
                    ) : (
                      <span className="text-danger">short by {formatINR(t.plan.plain - t.plan.surplus)}. Try a scenario to close the gap.</span>
                    )}
                  </div>
                </div>
              )}
              <div className="text-[10px] text-muted">{t.source === "model" ? "Words by the model, figures by RIPPLE" : "Template answer (model unavailable)"}</div>
            </div>
          ))}
          {busy && <div className="text-sm text-muted">Thinking…</div>}
        </div>
        <form
          className="flex gap-2 border-t border-line p-4"
          onSubmit={(e) => {
            e.preventDefault();
            ask(q);
          }}
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about your money…" className="flex-1 rounded-lg border border-line px-3 py-2 text-sm" aria-label="Ask the coach" />
          <button disabled={busy} className="rounded-lg bg-ink px-4 text-sm text-white disabled:opacity-50">
            Ask
          </button>
        </form>
        {s.refusals.length > 0 && (
          <div className="border-t border-line px-5 py-3 text-xs text-muted">
            <span className="font-medium text-ink">Refusal log ({s.refusals.length})</span>
            {s.refusals.slice(0, 3).map((r) => (
              <div key={r.id} className="truncate">
                {new Date(r.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · “{r.question}”
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
