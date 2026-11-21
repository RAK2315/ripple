"use client";
import { Component, type ReactNode } from "react";
import { STORE_KEY } from "@/lib/config";

/** Clears saved state and reloads with the demo profile. Works even when the store itself is broken. */
export function resetAndReload() {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    /* storage blocked: the reload still starts clean in memory */
  }
  window.location.href = "/?demo=1";
}

export function RecoveryScreen({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mx-auto mt-16 max-w-lg rounded-xl border border-line bg-card p-8" role="alert" data-testid="recovery">
      <div className="text-xs uppercase tracking-wide text-warn">Something needs a reset</div>
      <h1 className="mt-1 text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted">{detail}</p>
      <button onClick={resetAndReload} className="mt-5 rounded-lg bg-ink px-5 py-2 text-sm font-medium text-paper hover:opacity-90">
        Reset and reload demo data
      </button>
    </div>
  );
}

/** One bad value must never blank the app: a render error shows the recovery screen for that area instead. */
export class ErrorBoundary extends Component<{ children: ReactNode; compact?: boolean }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.warn("[ripple] recovered from a render error:", error.message);
  }
  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.compact) return null;
    return (
      <RecoveryScreen
        title="This screen hit a value it couldn't show"
        detail="Your saved data may be from an earlier version of RIPPLE. Resetting reloads the demo profile; nothing leaves your browser."
      />
    );
  }
}
