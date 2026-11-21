"use client";
import { useStore } from "./store";
import { callApi } from "./api";
import { categorizeAll, llmKey } from "./engine/categorize";
import { normalizeMerchant } from "./engine/merchants";
import type { LlmCategory } from "./types";

/** Stage 3 of categorization: send rows no rule or starter entry matched to the model, one entry per unique merchant. */
export async function categorizeUnmatched(): Promise<{ sent: number; usedModel: boolean }> {
  const s = useStore.getState();
  const cat = categorizeAll(s.transactions, s.rules, s.llmCache, s.userOverrides);
  const pending = new Map<string, { key: string; description: string; direction: "debit" | "credit"; merchant: string }>();
  for (const t of cat) {
    if (t.category_source !== "llm" || t.confidence !== 0) continue;
    const key = llmKey(t);
    if (!pending.has(key) && !s.llmCache[key]) pending.set(key, { key, description: t.raw_description, direction: t.direction, merchant: normalizeMerchant(t.raw_description) });
  }
  if (pending.size === 0) return { sent: 0, usedModel: false };
  const res = await callApi<Record<string, LlmCategory>>("categorize", { items: [...pending.values()] });
  if (res.ok && res.data) useStore.getState().setLlmCache(res.data);
  return { sent: pending.size, usedModel: !!res.usedModel };
}
