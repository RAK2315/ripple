"use client";
import { create } from "zustand";

export type AiMode = "model" | "fallback" | "template";

/** How the most recent AI-backed feature ran. Ephemeral, not persisted. */
export const useAiStatus = create<{ last: { route: string; mode: AiMode; at: number } | null }>(() => ({ last: null }));

export function noteAiStatus(route: string, ai: unknown) {
  if (!ai || typeof ai !== "object") return;
  const { calls = 0, failed = 0, fallback = 0 } = ai as { calls?: number; failed?: number; fallback?: number };
  if (!calls) return;
  const mode: AiMode = failed >= calls ? "template" : failed > 0 || fallback > 0 ? "fallback" : "model";
  useAiStatus.setState({ last: { route, mode, at: Date.now() } });
}
