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
          <CartesianGrid stroke="#e4e1d8" vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: "#6b6e80" }} interval={2} />
          <YAxis tickFormatter={(v) => formatINRShort(v)} tick={{ fontSize: 11, fill: "#6b6e80" }} width={56} />
          <Tooltip
            labelFormatter={(l) => monthLabel(String(l))}
            formatter={(v, name) => {
              if (Array.isArray(v)) return [`${formatINR(v[0])} – ${formatINR(v[1])}`, "Range"];
              const label = name === "actual" ? "Balance" : name === "likely" ? "Projected" : name === "compare" ? (compareLabel ?? "main") : String(name);
              return [formatINR(Number(v)), label];
            }}
          />
          <Area dataKey="band" stroke="none" fill="#0f766e" fillOpacity={0.13} isAnimationActive={false} />
          {compareLabel && <Line dataKey="compare" stroke="#94a3b8" strokeDasharray="4 4" dot={false} strokeWidth={1.5} isAnimationActive={false} />}
          <Line dataKey="actual" stroke="#16182b" strokeWidth={2.5} dot={false} isAnimationActive={false} />
          <Line dataKey="likely" stroke="#0f766e" strokeWidth={2.5} strokeDasharray="6 3" dot={false} isAnimationActive={false} />
          {proj.goals
            .filter((g) => g.projected)
            .map((g) => (
              <ReferenceLine
                key={g.goal.id}
                x={g.projected!}
                stroke={g.onTrack ? "#15803d" : "#b45309"}
                strokeDasharray="2 3"
                label={{ value: `${g.goal.name} ●`, position: "top", fontSize: 11, fill: g.onTrack ? "#15803d" : "#b45309", fontWeight: 600 }}
              />
            ))}
          {selected && <ReferenceLine x={selected} stroke="#16182b" strokeWidth={1.5} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
