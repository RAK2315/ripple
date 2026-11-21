"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useStore } from "@/lib/store";
import { useDerived } from "@/lib/derived";
import { APP_TODAY, GHOST_ANNUAL_RATE, PROJECTION_MONTHS } from "@/lib/config";
import { computeGhost, ghostSeries } from "@/lib/engine/ghost";
import { project } from "@/lib/engine/projection";
import { ym } from "@/lib/engine/dates";
import { formatINR, formatINRShort, monthLabel, monthLabelLong } from "@/lib/format";
import { useUi } from "@/lib/ui";
import { PageHeader } from "@/components/shell/shell";
import { CountUp } from "@/components/money";
import { AXIS_TICK } from "@/components/flow/timeline";
import { generateAdvice } from "@/lib/actions";

export function GhostScreen() {
  const s = useStore();
  const d = useDerived();
  const months = useMemo(() => [...d.history.map((h) => h.month), ...d.main.points.map((p) => p.month)], [d.history, d.main.points]);
  const ghost = useMemo(() => computeGhost(s.advice, d.categorized, months, APP_TODAY, GHOST_ANNUAL_RATE, s.adviceEvidence), [s.advice, d.categorized, months, s.adviceEvidence]);
  const rows = useMemo(
    () => ghostSeries(d.history, d.main.points, ghost.potByMonth).map((r) => ({ ...r, gap: [r.real, r.ghost] as [number, number] })),
    [d.history, d.main.points, ghost.potByMonth],
  );
  // ghost-you: starts with the pot today and keeps saving the gap every month
  const ghostProj = useMemo(
    () => project(d.baseline, [{ kind: "income_change", amount: ghost.monthlyGap }], s.goals, s.profile.current_balance + ghost.regret, APP_TODAY, PROJECTION_MONTHS),
    [d.baseline, ghost.monthlyGap, ghost.regret, s.goals, s.profile.current_balance],
  );
  const show = useUi((u) => u.showProvenance);

  if (s.transactions.length === 0) {
    return (
      <div className="card mx-auto mt-16 max-w-xl p-10 text-center">
        <h1 className="text-xl font-semibold">The ghost needs your history.</h1>
        <Link href="/import" className="mt-5 inline-block rounded-lg bg-ink px-5 py-3 text-sm text-paper">
          Import transactions
        </Link>
      </div>
    );
  }

  const open = ghost.items;
  const accepted = s.advice.filter((a) => a.accepted);
  const allEvidence = [...new Set(open.flatMap((i) => i.evidenceIds))];
  const goalLine = s.goals
    .map((g) => {
      const real = d.main.goals.find((x) => x.goal.id === g.id)?.projected ?? null;
      const gh = ghostProj.goals.find((x) => x.goal.id === g.id)?.projected ?? null;
      return { name: g.name, real, ghost: gh };
    })
    .filter((x) => x.ghost && x.real !== x.ghost);
  const today = ym(APP_TODAY);
  const last = rows[rows.length - 1];

  return (
    <div className="space-y-6">
      <PageHeader title="Ghost" sub="The version of you that took the advice. Every figure here is arithmetic on your transactions and the advice dates." />

      <div className="card overflow-hidden">
        <div className="grid grid-cols-[1.3fr_1fr]">
          <div className="p-8">
            <div className="text-xs uppercase tracking-wide text-ghost">Regret number</div>
            <button
              className="figure-hero mt-3 block text-ghost underline decoration-ghost/30 decoration-dotted decoration-1 underline-offset-[10px]"
              onClick={() => show("Payments made after the advice was given", allEvidence, `${open.length} pieces of advice not taken. Pot = each monthly saving banked after the month it was given, at ${GHOST_ANNUAL_RATE * 100}% a year.`)}
              data-testid="regret"
            >
              <CountUp value={ghost.regret} format={(v) => formatINR(v)} />
            </button>
            <p className="mt-3 max-w-md text-base">
              The version of you that acted on {open.length} piece{open.length === 1 ? "" : "s"} of advice has <b className="num">{formatINR(ghost.regret)}</b> more than you
              today.
            </p>
            <p className="mt-1 text-sm text-muted">
              The gap grows by <span className="num font-medium text-ink">{formatINR(ghost.monthlyGap)}</span> every month you wait.
            </p>
          </div>
          <div className="flex flex-col justify-center gap-4 border-l border-line bg-ghost-soft p-8">
            {goalLine.length ? (
              goalLine.map((g) => (
                <div key={g.name}>
                  <div className="text-xs text-muted">{g.name}</div>
                  <div className="text-sm">
                    Ghost-you: <b className="text-ghost">{monthLabelLong(g.ghost!)}</b>
                    {g.ghost! <= today ? " (already owns it)" : ""}
                    <span className="text-muted"> · you: {g.real ? monthLabelLong(g.real) : "not reached"}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-muted">No goal dates differ yet.</div>
            )}
          </div>
        </div>
      </div>

      <div className="card p-6">
        <h2>You and your ghost</h2>
        <p className="text-xs text-muted">Solid = past, dashed = projected. Shaded = the gap.</p>
        <div style={{ height: 320 }} className="mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 16, right: 120, bottom: 0, left: 8 }}>
              <CartesianGrid stroke="var(--border)" strokeOpacity={0.7} vertical={false} />
              <XAxis dataKey="month" tickFormatter={monthLabel} tick={AXIS_TICK} interval="preserveStartEnd" minTickGap={28} stroke="var(--border)" tickLine={false} />
              <YAxis tickFormatter={(v) => formatINRShort(v)} tick={AXIS_TICK} width={56} axisLine={false} tickLine={false} />
              <Tooltip
                wrapperClassName="chart-tooltip"
                contentStyle={{ background: "transparent", border: "none" }}
                labelFormatter={(l) => monthLabel(String(l))}
                formatter={(v, name) => (Array.isArray(v) ? [formatINR(v[1] - v[0]), "Gap"] : [formatINR(Number(v)), name === "ghost" ? "Ghost-you" : "You"])}
              />
              <Area dataKey="gap" stroke="none" fill="var(--projection)" fillOpacity={0.08} isAnimationActive={false} />
              <Line dataKey={(r: { future: boolean; real: number }) => (r.future ? null : r.real)} name="real" stroke="var(--text)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line dataKey={(r: { future: boolean; real: number; month: string }) => (r.future || r.month === today ? r.real : null)} name="real" stroke="var(--text)" strokeWidth={2} strokeDasharray="6 3" dot={false} isAnimationActive={false} />
              <Line
                dataKey="ghost"
                stroke="var(--projection)"
                strokeWidth={1.5}
                strokeDasharray="5 4"
                dot={false}
                isAnimationActive={false}
                style={{ filter: "drop-shadow(0 0 4px color-mix(in oklab, var(--projection) 55%, transparent))" }}
              />
              <ReferenceLine x={today} stroke="var(--text-faint)" strokeDasharray="2 3" label={{ value: "today", position: "top", fontSize: 11, fill: "var(--text-faint)" }} />
              {last && (
                <ReferenceLine
                  segment={[
                    { x: last.month, y: last.real },
                    { x: last.month, y: last.ghost },
                  ]}
                  shape={(p: { x1?: number; y1?: number; x2?: number; y2?: number }) =>
                    p.x1 == null || p.y1 == null || p.y2 == null ? (
                      <g />
                    ) : (
                      <g>
                        <path d={`M${p.x1 + 6},${p.y1} h6 V${p.y2} h-6`} fill="none" stroke="var(--projection)" strokeWidth={1} />
                        <line x1={p.x1 + 12} x2={p.x1 + 22} y1={(p.y1 + p.y2) / 2} y2={(p.y1 + p.y2) / 2} stroke="var(--projection)" strokeWidth={1} />
                        <text x={p.x1 + 26} y={(p.y1 + p.y2) / 2} dy="-0.2em" fontSize={13} fill="var(--projection)" fontFamily="var(--font-mono)">
                          {formatINR(last.ghost - last.real)}
                        </text>
                        <text x={p.x1 + 26} y={(p.y1 + p.y2) / 2} dy="1.1em" fontSize={11} fill="var(--text-muted)" fontFamily="var(--font-sans)">
                          gap by {monthLabel(last.month)}
                        </text>
                      </g>
                    )
                  }
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card divide-y divide-line">
        <div className="flex items-start justify-between gap-6 px-6 py-4">
          <div>
            <h2>Advice not taken</h2>
            <p className="text-xs text-muted">Accepting moves it out of the regret number from today. The rupee amounts come from our arithmetic on your data, never from the model.</p>
          </div>
          <FindOpportunities />
        </div>
        {open.length === 0 && <div className="px-6 py-6 text-sm text-muted">Nothing outstanding. Your ghost is you.</div>}
        {open.map((i) => (
          <div key={i.advice.id} className="grid grid-cols-[90px_1fr_150px_110px] items-center gap-4 px-6 py-3" data-testid="advice-row">
            <div className="text-xs text-muted">
              {i.advice.date_given}
              {i.advice.id.startsWith("adv_live_") && <div className="mt-1 w-fit rounded-md bg-ghost-soft px-2 py-1 text-[11px] font-medium text-ghost">New</div>}
            </div>
            <div>
              <div className="text-sm">{i.advice.text}</div>
              <div className="mt-1 text-xs text-muted">
                {formatINR(i.advice.projected_monthly_saving)}/month · ignored for {i.months} month{i.months === 1 ? "" : "s"}
                {i.evidenceIds.length > 0 && (
                  <>
                    {" · "}
                    <button className="underline decoration-dotted" onClick={() => show(`Payments since the advice: ${i.advice.text}`, i.evidenceIds)}>
                      {i.evidenceIds.length} payment{i.evidenceIds.length === 1 ? "" : "s"} since
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="num text-right text-base font-medium text-ghost">{formatINR(i.amount)}</div>
            <button
              onClick={() => {
                s.acceptAdvice(i.advice.id, APP_TODAY);
                useUi.getState().showToast(`Accepted. ${formatINR(i.advice.projected_monthly_saving)}/month leaves the gap from today.`);
              }}
              className="rounded-lg border border-ghost/40 px-3 py-2 text-sm text-ghost hover:bg-ghost-soft"
            >
              Accept
            </button>
          </div>
        ))}
        {accepted.length > 0 && (
          <div className="px-6 py-4 text-xs text-muted">
            Accepted:{" "}
            {accepted.map((a) => (
              <span key={a.id} className="mr-3">
                ✓ {a.text.split(".")[0]} ({a.acted_on_date})
              </span>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-muted">
        The advice history is seeded: this demo profile is a user who has had RIPPLE for six months. Ghost pot = each monthly saving banked at month end after the advice,
        growing at {GHOST_ANNUAL_RATE * 100}% a year.
      </p>
    </div>
  );
}

/** Runs the live advice agent: engine finds and prices, the model picks three and words them. */
function FindOpportunities() {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setNote(null);
          const r = await generateAdvice();
          setBusy(false);
          setNote(
            r.added
              ? `${r.added} new piece${r.added === 1 ? "" : "s"} of advice from your last three months.`
              : r.covered
                ? "Your biggest opportunities are already on this list."
                : "No new savings opportunities in your recent spending.",
          );
          useUi.getState().showToast(r.added ? `${r.added} new opportunities found. Savings are computed from your transactions.` : "Nothing new to add.");
        }}
        className="rounded-md border border-ghost/40 px-3 py-2 text-sm text-ghost transition-colors hover:bg-ghost-soft disabled:opacity-50"
        data-testid="find-opportunities"
      >
        {busy ? "Analysing your history…" : "Find new opportunities"}
      </button>
      {busy && <div className="skeleton h-2 w-40" aria-busy="true" />}
      {note && <div className="max-w-xs text-right text-xs text-muted">{note}</div>}
    </div>
  );
}
