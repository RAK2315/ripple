"use client";
import { ResponsiveContainer, Sankey, Tooltip } from "recharts";
import type { SankeyNodeProps as NodeProps } from "recharts";
import type { MonthFlows } from "@/lib/engine/flows";
import { formatINR, formatINRShort } from "@/lib/format";
import { useUi } from "@/lib/ui";

type Node = { name: string; ids: string[]; tone: "income" | "fixed" | "variable" | "saved" | "leak" | "deficit" };

const TONE: Record<Node["tone"], string> = {
  income: "#16182b",
  fixed: "#475569",
  variable: "#0f766e",
  saved: "#15803d",
  leak: "#b42318",
  deficit: "#b45309",
};

export function FlowSankey({ flows }: { flows: MonthFlows }) {
  const show = useUi((s) => s.showProvenance);
  const nodes: Node[] = [];
  const links: { source: number; target: number; value: number; stroke: string; strokeOpacity: number }[] = [];
  const add = (n: Node) => nodes.push(n) - 1;
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
  links.push({ source: income, target: fixed, value: r(Math.min(fixedTotal, flows.income.amount)), stroke: TONE.fixed, strokeOpacity: 0.25 });
  if (fromIncomeToVar > 0) links.push({ source: income, target: variable, value: r(fromIncomeToVar), stroke: TONE.variable, strokeOpacity: 0.25 });
  if (deficit >= 0) links.push({ source: deficit, target: variable, value: r(flows.deficit), stroke: TONE.deficit, strokeOpacity: 0.35 });
  if (flows.saved > 0) {
    const saved = add({ name: "Saved", ids: [], tone: "saved" });
    links.push({ source: income, target: saved, value: r(flows.saved), stroke: TONE.saved, strokeOpacity: 0.3 });
  }
  for (const f of flows.fixed) {
    const n = add({ name: f.label, ids: f.ids, tone: f.leak ? "leak" : "fixed" });
    links.push({ source: fixed, target: n, value: r(f.amount), stroke: f.leak ? TONE.leak : TONE.fixed, strokeOpacity: f.leak ? 0.55 : 0.2 });
  }
  for (const f of flows.variable) {
    const n = add({ name: f.label, ids: f.ids, tone: "variable" });
    links.push({ source: variable, target: n, value: r(f.amount), stroke: TONE.variable, strokeOpacity: 0.2 });
  }

  const NodeShape = (props: NodeProps) => {
    const { x, y, width, height, payload } = props;
    const n = nodes[props.index];
    const value = (payload as unknown as { value: number }).value * 100;
    const right = x > 400;
    return (
      <g
        style={{ cursor: n.ids.length ? "pointer" : "default" }}
        onClick={() => n.ids.length && show(`${n.name} · ${flows.month}`, n.ids, flows.kind === "projected" ? "Projected month: rows shown are the history behind this estimate." : undefined)}
      >
        <rect x={x} y={y} width={width} height={Math.max(2, height)} fill={TONE[n.tone]} rx={2} />
        <text x={right ? x + width + 8 : x + width + 8} y={y + height / 2} dy="0.35em" fontSize={12} fill="#16182b" fontWeight={n.tone === "leak" ? 600 : 500}>
          {n.name} <tspan fill={n.tone === "leak" ? TONE.leak : "#6b6e80"} fontWeight={400}>{formatINRShort(value)}</tspan>
        </text>
      </g>
    );
  };

  return (
    <div className="h-[380px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <Sankey
          data={{ nodes, links }}
          node={NodeShape}
          nodePadding={14}
          nodeWidth={10}
          linkCurvature={0.5}
          iterations={64}
          margin={{ top: 10, right: 160, bottom: 10, left: 10 }}
          sort={false}
        >
          <Tooltip formatter={(v) => formatINR(Number(v) * 100)} />
        </Sankey>
      </ResponsiveContainer>
    </div>
  );
}
