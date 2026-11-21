"use client";
import { useMemo } from "react";
import { useDerived } from "@/lib/derived";
import { useStore } from "@/lib/store";
import { APP_TODAY } from "@/lib/config";
import { computeNudges } from "@/lib/engine/nudges";
import { goalImpactDays } from "@/lib/engine/projection";
import { dateLabel, monthLabelLong } from "@/lib/format";
import { Money } from "@/components/money";
import { useUi } from "@/lib/ui";

function ordinal(d: string) {
  const n = +d.slice(8, 10);
  const s = n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th";
  return `${n}${s}`;
}

export function NudgeList({ compact = false }: { compact?: boolean }) {
  const d = useDerived();
  const goals = useStore((s) => s.goals);
  const balance = useStore((s) => s.profile.current_balance);
  const acks = useStore((s) => s.nudgeAcks);
  const ack = useStore((s) => s.ackNudge);
  const nudges = useMemo(
    () => computeNudges(d.categorized, d.recurring, d.baseline, goals, balance, APP_TODAY),
    [d.categorized, d.recurring, d.baseline, goals, balance],
  );
  const visible = nudges.filter((n) => !acks[n.id]);
  if (visible.length === 0) return null;
  return (
    <div className="space-y-3">
      {visible.slice(0, compact ? 1 : 10).map((n) => {
        const extra = n.projectedFull - n.expectedFull;
        const days = goalImpactDays(Math.max(0, extra), d.main.plan.surplus);
        return (
          <div key={n.id} className="card flex items-start gap-4 border-l-4 border-l-warn p-5">
            <div className="flex-1 text-sm leading-relaxed">
              <div className="text-xs uppercase tracking-wide text-warn">Drifting off plan</div>
              <p className="mt-1">
                <b>{n.category}</b> is at <Money paise={n.spent} ids={n.ids} title={`${n.category} this month`} className="font-semibold" /> with {n.daysLeft} days left
                in the month. Your usual full month is <Money paise={n.expectedFull} className="font-semibold" />. The three transactions driving this were on the{" "}
                {n.drivers.map((t, i) => (
                  <span key={t.id}>
                    {i > 0 && (i === n.drivers.length - 1 ? " and " : ", ")}
                    <button
                      className="underline decoration-dotted underline-offset-4"
                      title={`${t.merchant_normalized} · ${dateLabel(t.date)}`}
                      onClick={() => useUi.getState().showProvenance(`${n.category} drivers this month`, n.drivers.map((x) => x.id))}
                    >
                      {ordinal(t.date)}
                    </button>
                    {i === n.drivers.length - 1 && "."}
                  </span>
                ))}
              </p>
              {n.goalName && n.goalFrom && (
                <p className="mt-1 text-muted">
                  {n.goalTo === n.goalFrom ? (
                    <>
                      If this continues, it costs your {n.goalName.toLowerCase()} goal about <b className="text-warn">{Math.round(days ?? 0)} days</b> a month.
                    </>
                  ) : (
                    <>
                      If this continues, your {n.goalName.toLowerCase()} goal moves from <b className="text-ink">{monthLabelLong(n.goalFrom)}</b> to{" "}
                      <b className="text-warn">{n.goalTo ? monthLabelLong(n.goalTo) : "out of reach"}</b>
                      {days != null && <> (about {Math.round(days)} days per month at this pace)</>}.
                    </>
                  )}
                </p>
              )}
            </div>
            <button onClick={() => ack(n.id)} className="shrink-0 rounded-lg border border-line px-3 py-2 text-xs text-muted hover:text-ink">
              Got it
            </button>
          </div>
        );
      })}
    </div>
  );
}
