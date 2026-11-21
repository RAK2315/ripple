"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { useDerived } from "@/lib/derived";
import { callApi } from "@/lib/api";
import { APP_TODAY } from "@/lib/config";
import { ym } from "@/lib/engine/dates";
import { monthReview } from "@/lib/engine/review";
import { computeNudges } from "@/lib/engine/nudges";
import { formatINR, monthLabelLong } from "@/lib/format";
import { Money } from "@/components/money";

export function ReportScreen() {
  const s = useStore();
  const d = useDerived();
  const months = useMemo(() => d.baseline.completeMonths, [d.baseline.completeMonths]);
  const [month, setMonth] = useState<string | null>(null);
  const m = month ?? months[months.length - 1] ?? ym(APP_TODAY);
  const r = useMemo(() => monthReview(d.categorized, d.recurring, m), [d.categorized, d.recurring, m]);
  const nudges = useMemo(
    () => computeNudges(d.categorized, d.recurring, d.baseline, s.goals, s.profile.current_balance, APP_TODAY),
    [d.categorized, d.recurring, d.baseline, s.goals, s.profile.current_balance],
  );
  const goal = d.main.nearestGoal ?? d.main.goals[0];
  const [story, setStory] = useState<{ key: string; paragraphs: string[]; source: string } | null>(null);

  const facts = useMemo(() => {
    const top = r.categories[0];
    const bc = r.biggestChange;
    return {
      month: monthLabelLong(r.month),
      prev_month: r.prevMonth ? monthLabelLong(r.prevMonth) : "the month before",
      income_total: formatINR(r.income),
      spend_total: formatINR(r.spend),
      net: formatINR(r.net, { sign: true }),
      top_category: top?.category ?? "—",
      top_category_amount: formatINR(top?.amount ?? 0),
      biggest_change_category: bc?.category ?? "—",
      biggest_change_dir: bc && bc.delta >= 0 ? "up" : "down",
      biggest_change_amount: formatINR(Math.abs(bc?.delta ?? 0)),
      goal_name: goal?.goal.name ?? "your goal",
      goal_projected: goal?.projected ? monthLabelLong(goal.projected) : "not reached",
      goal_date: goal ? monthLabelLong(ym(goal.goal.target_date)) : "—",
      goal_status: goal?.onTrack ? "on track" : "behind",
      opportunity: r.opportunity ? `${r.opportunity.text}, worth ${formatINR(r.opportunity.monthly)} a month` : "keep doing what you're doing",
      surplus: formatINR(d.main.plan.surplus),
    };
  }, [r, goal, d.main.plan.surplus]);
  const key = JSON.stringify(facts);

  useEffect(() => {
    if (s.transactions.length === 0 || story?.key === key) return;
    let live = true;
    callApi<{ paragraphs: string[]; source: string }>("narrative", { facts }).then((res) => {
      if (live && res.ok && res.data) setStory({ key, ...res.data });
    });
    return () => {
      live = false;
    };
  }, [key, facts, story?.key, s.transactions.length]);

  if (s.transactions.length === 0) {
    return (
      <div className="card mx-auto mt-16 max-w-xl p-10 text-center">
        <h1 className="text-xl font-semibold">Your monthly review appears after your first import.</h1>
        <Link href="/import" className="mt-5 inline-block rounded-lg bg-ink px-5 py-2.5 text-sm text-white">
          Import transactions
        </Link>
      </div>
    );
  }

  const maxCat = Math.max(1, ...r.categories.map((c) => Math.max(c.amount, c.prev)));
  const acked = nudges.filter((n) => s.nudgeAcks[n.id]).length;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">Monthly review</div>
          <h1 className="text-3xl font-semibold">{monthLabelLong(r.month)}</h1>
        </div>
        <div className="no-print flex gap-2">
          <select value={m} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border border-line bg-card px-3 py-1.5 text-sm">
            {months.map((x) => (
              <option key={x} value={x}>
                {monthLabelLong(x)}
              </option>
            ))}
          </select>
          <button onClick={() => window.print()} className="rounded-lg bg-ink px-4 py-1.5 text-sm text-white">
            Print / save PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Stat label="Money in" value={<Money paise={r.income} ids={r.incomeIds} title={`Credits, ${monthLabelLong(r.month)}`} />} />
        <Stat label="Money out" value={<Money paise={r.spend} ids={r.spendIds} title={`Debits, ${monthLabelLong(r.month)}`} />} />
        <Stat label="Net" value={<span className={r.net >= 0 ? "text-accent" : "text-danger"}>{formatINR(r.net, { sign: true })}</span>} />
      </div>

      <div className="card p-6" data-testid="narrative">
        {story ? (
          <>
            {story.paragraphs.map((p, i) => (
              <p key={i} className="mb-3 text-[15px] leading-relaxed last:mb-0">
                {p}
              </p>
            ))}
            <div className="mt-3 text-[10px] text-muted">{story.source === "model" ? "Words by the model, every figure by RIPPLE's arithmetic" : "Template narrative (model unavailable)"}</div>
          </>
        ) : (
          <div className="text-sm text-muted">Writing the narrative around your numbers…</div>
        )}
      </div>

      <div className="grid grid-cols-[1.4fr_1fr] gap-6">
        <div className="card p-6">
          <h2 className="font-semibold">Spend by category vs {r.prevMonth ? monthLabelLong(r.prevMonth) : "previous month"}</h2>
          <div className="mt-3 space-y-2">
            {r.categories.map((c) => (
              <div key={c.category} className="grid grid-cols-[130px_1fr_90px_80px] items-center gap-3 text-sm">
                <span className="truncate">{c.category}</span>
                <div className="relative h-3">
                  <div className="absolute inset-y-0 left-0 rounded bg-line" style={{ width: `${(c.prev / maxCat) * 100}%` }} />
                  <div className="absolute inset-y-0.5 left-0 rounded bg-ink" style={{ width: `${(c.amount / maxCat) * 100}%` }} />
                </div>
                <Money paise={c.amount} ids={c.ids} title={`${c.category}, ${monthLabelLong(r.month)}`} className="text-right" />
                <span className={`num text-right text-xs ${c.delta > 0 ? "text-danger" : c.delta < 0 ? "text-accent" : "text-muted"}`}>
                  {c.delta === 0 ? "—" : formatINR(c.delta, { sign: true })}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 text-[11px] text-muted">Dark bar = this month, grey = previous month.</div>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="font-semibold">Goal progress</h2>
            {d.main.goals.map((g) => (
              <div key={g.goal.id} className="mt-2 text-sm">
                {g.goal.name}: {g.projected ? monthLabelLong(g.projected) : "not reached"}{" "}
                <span className="text-muted">vs plan {monthLabelLong(ym(g.goal.target_date))}</span>{" "}
                <span className={g.onTrack ? "text-accent" : "text-warn"}>{g.onTrack ? "✓ on track" : `${g.monthsLate} mo late`}</span>
              </div>
            ))}
          </div>
          <div className="card p-5">
            <h2 className="font-semibold">Recurring payments</h2>
            {r.changedRecurring.map((x) => (
              <div key={x.id} className="mt-2 text-sm">
                <span className="text-warn">Changed:</span> {x.merchant_normalized} {formatINR(x.previous_amount ?? 0)} → {formatINR(x.amount)}
              </div>
            ))}
            {r.newRecurring.map((x) => (
              <div key={x.id} className="mt-2 text-sm">
                <span className="text-accent">New:</span> {x.merchant_normalized} {formatINR(x.monthly_amount)}/mo
              </div>
            ))}
            {!r.changedRecurring.length && !r.newRecurring.length && <div className="mt-2 text-sm text-muted">No changes.</div>}
          </div>
          <div className="card p-5">
            <h2 className="font-semibold">Nudges</h2>
            <div className="mt-1 text-sm text-muted">
              {nudges.length} raised this month, {acked} acknowledged.
            </div>
          </div>
          {r.opportunity && (
            <div className="card border-l-4 border-l-accent p-5">
              <div className="text-xs uppercase tracking-wide text-accent">Biggest opportunity next month</div>
              <div className="mt-1 text-sm">
                {r.opportunity.text[0].toUpperCase() + r.opportunity.text.slice(1)}:{" "}
                <Money paise={r.opportunity.monthly} ids={r.opportunity.ids} title="Opportunity" className="font-semibold" /> a month.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="card p-5">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
