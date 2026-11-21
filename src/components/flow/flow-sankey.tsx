"use client";
import { useState } from "react";
import { ResponsiveContainer, Sankey, Tooltip } from "recharts";
import type { SankeyNodeProps as NodeProps } from "recharts";
import type { MonthFlows } from "@/lib/engine/flows";
import { formatINR, formatINRShort } from "@/lib/format";
import { useUi } from "@/lib/ui";

type Tone = "income" | "fixed" | "variable" | "saved" | "leak" | "deficit";
type Node = { name: string; ids: string[]; tone: Tone; tint: string };
type Link = { source: number; target: number; value: number; leak: boolean };

// every colour is a token or a tint of a token: inflow, outflow, warning
const tint = (token: string, pct: number) => `color-mix(in oklab, var(${token}) ${pct}%, var(--surface))`;
const BASE: Record<Tone, string> = {
  income: "var(--inflow)",
  saved: "var(--inflow)",
  fixed: tint("--outflow", 70),
  variable: tint("--warning", 75),
  leak: "var(--outflow)",
  deficit: "var(--warning)",
};

export function FlowSankey({ flows }: { flows: MonthFlows }) {
  const show = useUi((s) => s.showProvenance);
  const [hover, setHover] = useState<{ kind: "link" | "node"; index: number } | null>(null);
  const nodes: Node[] = [];
  const links: Link[] = [];
  const add = (n: Omit<Node, "tint"> & { tint?: string }) => nodes.push({ ...n, tint: n.tint ?? BASE[n.tone] }) - 1;
  const r = (p: number) => Math.max(1, Math.round(p / 100));

  const income = add({ name: "Income", ids: flows.income.ids, tone: "income" });
  const fixedTotal = flows.fixed.reduce((a, f) => a + f.amount, 0);
  const varTotal = flows.variable.reduce((a, f) => a + f.amount, 0);
  const fixed = add({ name: "Fixed", ids: flows.fixed.flatMap((f) => f.ids), tone: "fixed" });
  const variable = add({ name: "Variable", ids: flows.variable.flatMap((f) => f.ids), tone: "variable" });
  let deficit = -1;
  if (flows.deficit > 0) deficit = add({ name: "From balance", ids: [], tone: "deficit" });

  // income splits; if spending > income, the deficit node feeds the variable bucket
  const fromIncomeToVar = Math.max(0, varTotal - flows.deficit);
  links.push({ source: income, target: fixed, value: r(Math.min(fixedTotal, flows.income.amount)), leak: false });
  if (fromIncomeToVar > 0) links.push({ source: income, target: variable, value: r(fromIncomeToVar), leak: false });
  if (deficit >= 0) links.push({ source: deficit, target: variable, value: r(flows.deficit), leak: false });
  if (flows.saved > 0) {
    const saved = add({ name: "Saved", ids: [], tone: "saved" });
    links.push({ source: income, target: saved, value: r(flows.saved), leak: false });
  }
  flows.fixed.forEach((f, i) => {
    const n = add({ name: f.label, ids: f.ids, tone: f.leak ? "leak" : "fixed", tint: f.leak ? BASE.leak : tint("--outflow", 78 - Math.min(40, i * 6)) });
    links.push({ source: fixed, target: n, value: r(f.amount), leak: !!f.leak });
  });
  flows.variable.forEach((f, i) => {
    const n = add({ name: f.label, ids: f.ids, tone: "variable", tint: tint("--warning", 82 - Math.min(44, i * 6)) });
    links.push({ source: variable, target: n, value: r(f.amount), leak: false });
  });

  const linkActive = (i: number) => {
    if (!hover) return true;
    const l = links[i];
    if (hover.kind === "link") return hover.index === i;
    return l.source === hover.index || l.target === hover.index;
  };
  const nodeActive = (i: number) => {
    if (!hover) return true;
    if (hover.kind === "node") return hover.index === i || links.some((l) => (l.source === hover.index && l.target === i) || (l.target === hover.index && l.source === i));
    const l = links[hover.index];
    return l.source === i || l.target === i;
  };

  const LinkShape = (p: {
    sourceX: number;
    sourceY: number;
    sourceControlX: number;
    targetX: number;
    targetY: number;
    targetControlX: number;
    linkWidth: number;
    index: number;
  }) => {
    const l = links[p.index];
    const target = nodes[l.target];
    const id = `flow-grad-${p.index}`;
    const d = `M${p.sourceX},${p.sourceY} C${p.sourceControlX},${p.sourceY} ${p.targetControlX},${p.targetY} ${p.targetX},${p.targetY}`;
    const on = linkActive(p.index);
    return (
      <g onMouseEnter={() => setHover({ kind: "link", index: p.index })} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={p.sourceX} x2={p.targetX} y1={0} y2={0}>
            <stop offset="0%" stopColor={l.source === deficit ? "var(--warning)" : "var(--inflow)"} />
            <stop offset="100%" stopColor={target.tint} />
          </linearGradient>
        </defs>
        {/* solid body carries the amount; the dashed overlay makes it breathe */}
        <path
          d={d}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={Math.max(1, p.linkWidth)}
          strokeOpacity={l.leak ? 0 : on ? 0.5 : 0.12}
          style={{ transition: "stroke-opacity 200ms ease-out" }}
        />
        <path
          d={d}
          fill="none"
          stroke={l.leak ? "var(--outflow)" : "var(--surface)"}
          strokeWidth={l.leak ? Math.max(2, p.linkWidth) : Math.min(1.5, Math.max(0.5, p.linkWidth / 6))}
          strokeOpacity={on ? (l.leak ? 0.9 : 0.55) : 0.04}
          className={`flow-link ${l.leak ? "leak" : ""}`}
        />
      </g>
    );
  };

  const NodeShape = (props: NodeProps) => {
    const { x, y, width, height, payload } = props;
    const n = nodes[props.index];
    const value = (payload as unknown as { value: number }).value * 100;
    const on = nodeActive(props.index);
    return (
      <g
        style={{ cursor: n.ids.length ? "pointer" : "default", opacity: on ? 1 : 0.25, transition: "opacity 200ms ease-out" }}
        onMouseEnter={() => setHover({ kind: "node", index: props.index })}
        onMouseLeave={() => setHover(null)}
        onClick={() => n.ids.length && show(`${n.name} · ${flows.month}`, n.ids, flows.kind === "projected" ? "Projected month: rows shown are the history behind this estimate." : undefined)}
        tabIndex={n.ids.length ? 0 : -1}
        role={n.ids.length ? "button" : undefined}
        aria-label={`${n.name} ${formatINR(value)}`}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && n.ids.length && show(`${n.name} · ${flows.month}`, n.ids)}
      >
        <rect x={x} y={y} width={width} height={Math.max(2, height)} fill={n.tint} rx={2} />
        <text x={x + width + 8} y={y + height / 2} dy="0.35em" fontSize={12} fill="var(--text)" fontWeight={n.tone === "leak" ? 600 : 500} fontFamily="var(--font-sans)">
          {n.name}{" "}
          <tspan fill={n.tone === "leak" ? "var(--outflow)" : "var(--text-muted)"} fontWeight={400} fontFamily="var(--font-mono)" fontSize={11}>
            {formatINRShort(value)}
          </tspan>
        </text>
      </g>
    );
  };

  return (
    <div className="h-[360px] w-full" onMouseLeave={() => setHover(null)}>
      <ResponsiveContainer width="100%" height="100%">
        <Sankey
          data={{ nodes, links }}
          node={NodeShape}
          link={LinkShape as never}
          nodePadding={12}
          nodeWidth={8}
          linkCurvature={0.5}
          iterations={64}
          margin={{ top: 8, right: 170, bottom: 8, left: 8 }}
          sort={false}
        >
          <Tooltip wrapperClassName="chart-tooltip" contentStyle={{ background: "transparent", border: "none" }} formatter={(v) => formatINR(Number(v) * 100)} />
        </Sankey>
      </ResponsiveContainer>
    </div>
  );
}
