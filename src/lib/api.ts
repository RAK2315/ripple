"use client";
import { useStore } from "./store";
import { personNames, protect } from "./ai/protect";
import { noteAiStatus } from "./ai-status";
import type { Transaction } from "./types";

let namesFor: { txns: Transaction[] | null; names: string[] } = { txns: null, names: [] };

/** Person names in the user's own data, recomputed only when the transactions change. */
function currentNames(): string[] {
  const txns = useStore.getState().transactions;
  if (namesFor.txns !== txns) namesFor = { txns, names: personNames(txns.map((t) => t.raw_description)) };
  return namesFor.names;
}

/**
 * Client wrapper for /api routes, and the single point where model-bound payloads are built: every name in the
 * user's data is tokenized here (src/lib/ai/protect.ts) before the body leaves the browser, then restored in the
 * response. Logs the masked payload for "What the AI sees". Never throws.
 */
export async function callApi<T>(route: string, body: unknown): Promise<{ ok: boolean; data?: T; usedModel?: boolean; error?: string }> {
  const names = currentNames();
  const p = protect(body, names);
  // routes that carry an opaque file (PDF bytes) apply the same tokens server-side to the text they extract
  const sent = route === "vision" && p.body && typeof p.body === "object" ? { ...(p.body as object), _names: names } : p.body;
  try {
    const res = await fetch(`/api/${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sent) });
    const raw = await res.text();
    let json: { ok: boolean; data?: T; usedModel?: boolean; error?: string; masked?: string; ai?: unknown };
    try {
      json = JSON.parse(raw);
    } catch {
      const why = res.status === 413 ? "The file is too large to upload (the limit is about 3 MB)." : `The server returned an unexpected response (HTTP ${res.status}).`;
      return { ok: false, error: why };
    }
    if (json.masked) useStore.getState().logAi(route, json.masked);
    noteAiStatus(route, json.ai);
    return { ...json, data: json.data === undefined ? undefined : p.restore(json.data) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
