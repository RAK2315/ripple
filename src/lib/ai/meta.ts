import { AsyncLocalStorage } from "node:async_hooks";

/** Per-request record of how model calls went, so the client can show when a feature ran on a fallback. */
export interface AiMeta {
  /** model calls attempted */
  calls: number;
  /** calls that produced no model output (no key, quota, error): the route used its template/heuristic */
  failed: number;
  /** calls answered by a fallback model after the primary failed */
  fallback: number;
}

const als = new AsyncLocalStorage<AiMeta>();

export function recordCall(outcome: "ok" | "failed" | "fallback") {
  const m = als.getStore();
  if (!m) return;
  m.calls++;
  if (outcome === "failed") m.failed++;
  if (outcome === "fallback") m.fallback++;
}

/** Wrap a route handler: model calls inside it are counted and the counts are added to the JSON response as `ai`. */
export function aiRoute(handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const meta: AiMeta = { calls: 0, failed: 0, fallback: 0 };
    const res = await als.run(meta, () => handler(req));
    if (!meta.calls) return res;
    try {
      const json = await res.json();
      return Response.json({ ...json, ai: meta }, { status: res.status });
    } catch {
      return res;
    }
  };
}
