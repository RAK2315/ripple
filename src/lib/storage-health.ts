"use client";
import { create } from "zustand";

/**
 * What happened when saved state was loaded. "corrupt" (unreadable JSON) and "invalid" (wrong shape) show the
 * recovery screen; "cleared-old" (saved by an earlier deploy) was discarded and gets a one-line notice.
 */
export type StorageProblem = "corrupt" | "invalid" | "cleared-old";

export const useStorageHealth = create<{ problem: StorageProblem | null }>(() => ({ problem: null }));

export function storageProblem(p: StorageProblem) {
  useStorageHealth.setState({ problem: p });
}
