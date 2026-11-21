"use client";
import { useStore } from "./store";

/** Client wrapper for /api routes. Logs the masked payload for the "What the AI sees" panel. Never throws. */
export async function callApi<T>(route: string, body: unknown): Promise<{ ok: boolean; data?: T; usedModel?: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json();
    if (json.masked) useStore.getState().logAi(route, json.masked);
    return json;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
