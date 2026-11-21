"use client";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Projection } from "@/lib/engine/projection";
import { formatINR, formatINRShort, monthLabel } from "@/lib/format";

export interface TimelineRow {
  month: string;
  actual?: number;
  likely?: number;
  band?: [number, number];
  compare?: number;
  ghost?: number;
}

export function buildTimeline(history: { month: string; balance: number }[], proj: Projection, compare?: Projection): TimelineRow[] {
  const rows: TimelineRow[] = history.map((h) => ({ month: h.month, actual: h.balance }));
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  proj.points.forEach((p, i) => {
    const row = byMonth.get(p.month) ?? { month: p.month };
    row.likely = p.likely;
    row.band = [p.pessimistic, p.optimistic];
    if (compare) row.compare = compare.points[i]?.likely;
    if (!byMonth.has(p.month)) {
      rows.push(row);
      byMonth.set(p.month, row);
    }
  });
  return rows;
}

export const AXIS_TICK = { fontSize: 11, fill: "var(--text-faint)", fontFamily: "var(--font-mono)" };

/** Goal marker drawn as a translated group so it glides (spring-ish, no bounce) when a scenario moves it. */
function GoalMarker({ x1, y1, y2, label, onTrack }: { x1?: number; y1?: number; y2?: number; label: string; onTrack: boolean }) {
  if (x1 == null || y1 == null || y2 == null) return null;
  const c = onTrack ? "var(--inflow)" : "var(--warning)";
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  return (
    <g className="goal-marker" style={{ transform: `translateX(${x1}px)` }}>
      <line x1={0} x2={0} y1={top} y2={bottom} stroke={c} strokeDasharray="2 3" strokeWidth={1} />
      <circle cx={0} cy={top - 8} r={3} fill={c} />
      <text x={6} y={top - 8} dy="0.35em" fontSize={11} fontWeight={600} fill={c} fontFamily="var(--font-sans)">
        {label}
      </text>
    </g>
  );
}

export function Timeline({
  rows,
  proj,
  selected,
  compareLabel,
  height = 300,
}: {
  rows: TimelineRow[];
  proj: Projection;
  selected?: string;
  compareLabel?: string;
  height?: number;
}) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 24, right: 16, bottom: 0, left: 8 }}>
          <defs>
            <filter id="cone-soft" x="-5%" y="-20%" width="110%" height="140%">
              <feGaussianBlur stdDeviation="3" />
            </filter>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeOpacity={0.7} vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthLabel} tick={AXIS_TICK} interval={2} stroke="var(--border)" tickLine={false} />
          <YAxis tickFormatter={(v) => formatINRShort(v)} tick={AXIS_TICK} width={56} axisLine={false} tickLine={false} />
          <Tooltip
            wrapperClassName="chart-tooltip"
            contentStyle={{ background: "transparent", border: "none" }}
            labelFormatter={(l) => monthLabel(String(l))}
            formatter={(v, name) => {
              if (Array.isArray(v)) return [`${formatINR(v[0])} – ${formatINR(v[1])}`, "Range"];
              const label = name === "actual" ? "Balance" : name === "likely" ? "Projected" : name === "compare" ? (compareLabel ?? "main") : String(name);
              return [formatINR(Number(v)), label];
            }}
          />
          {/* uncertainty cone: projection colour at 6%, soft edges, no border */}
          <Area dataKey="band" stroke="none" fill="var(--projection)" fillOpacity={0.06} isAnimationActive={false} style={{ filter: "url(#cone-soft)" }} />
          <Area dataKey="band" stroke="none" fill="var(--projection)" fillOpacity={0.06} isAnimationActive={false} />
          {compareLabel && <Line dataKey="compare" stroke="var(--text-faint)" strokeDasharray="4 4" dot={false} strokeWidth={1.5} isAnimationActive={false} />}
          <Line dataKey="actual" stroke="var(--text)" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="likely" stroke="var(--projection)" strokeWidth={2} strokeDasharray="6 3" dot={false} isAnimationActive={false} />
          {proj.goals
            .filter((g) => g.projected)
            .map((g) => (
              <ReferenceLine
                key={g.goal.id}
                x={g.projected!}
                shape={(p: { x1?: number; y1?: number; y2?: number }) => <GoalMarker {...p} label={g.goal.name} onTrack={g.onTrack} />}
              />
            ))}
          {selected && <ReferenceLine x={selected} stroke="var(--text)" strokeWidth={1} strokeOpacity={0.6} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
