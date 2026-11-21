"use client";
import { create } from "zustand";

/** Ephemeral UI state, not persisted. */
interface UiState {
  provenance: { title: string; ids: string[]; note?: string } | null;
  toast: { text: string; tone?: "ok" | "warn" } | null;
  aiPanel: boolean;
  showProvenance: (title: string, ids: string[], note?: string) => void;
  closeProvenance: () => void;
  showToast: (text: string, tone?: "ok" | "warn") => void;
  setAiPanel: (open: boolean) => void;
}

export const useUi = create<UiState>((set) => ({
  provenance: null,
  toast: null,
  aiPanel: false,
  showProvenance: (title, ids, note) => set({ provenance: { title, ids, note } }),
  closeProvenance: () => set({ provenance: null }),
  showToast: (text, tone = "ok") => {
    set({ toast: { text, tone } });
    setTimeout(() => set((s) => (s.toast?.text === text ? { toast: null } : s)), 4500);
  },
  setAiPanel: (aiPanel) => set({ aiPanel }),
}));
