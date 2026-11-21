"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useHydrated } from "@/lib/derived";
import { useStore } from "@/lib/store";
import { useUi } from "@/lib/ui";
import { ProvenanceDrawer } from "./provenance-drawer";
import { AiPanel } from "./ai-panel";
import { useEffect } from "react";
import { categorizeUnmatched } from "@/lib/actions";

const NAV = [
  { href: "/", label: "Flow" },
  { href: "/import", label: "Import" },
  { href: "/review", label: "Review" },
  { href: "/rules", label: "Rulebook" },
  { href: "/scenarios", label: "Scenarios" },
  { href: "/ghost", label: "Ghost" },
  { href: "/subscriptions", label: "Subscriptions & alerts" },
  { href: "/goals", label: "Goals & Profile" },
  { href: "/report", label: "Monthly Review" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const hydrated = useHydrated();
  const toast = useUi((s) => s.toast);
  const setAiPanel = useUi((s) => s.setAiPanel);
  const aiCount = useStore((s) => s.aiLog.length);
  // ?demo=1 loads the demo profile on a fresh browser (used for screenshots and the reset path)
  useEffect(() => {
    if (!hydrated) return;
    if (new URLSearchParams(window.location.search).get("demo") === "1" && useStore.getState().transactions.length === 0) {
      useStore.getState().loadFixture();
      categorizeUnmatched();
    }
  }, [hydrated]);
  return (
    <div className="flex min-h-screen">
      <aside className="no-print sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-line bg-card px-4 py-6">
        <Link href="/" className="mb-8 block">
          <div className="text-2xl font-semibold tracking-tight">
            RIPPLE<span className="text-accent">.</span>
          </div>
          <div className="mt-1 text-[11px] leading-snug text-muted">See where your money is going, and where it ends up.</div>
        </Link>
        <nav className="flex flex-col gap-0.5">
          {NAV.map((n) => {
            const on = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-lg px-3 py-2 text-sm transition ${on ? "bg-ink text-white" : "text-ink/80 hover:bg-paper"}`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={() => setAiPanel(true)}
          className="mt-auto rounded-lg border border-line px-3 py-2 text-left text-xs text-muted hover:bg-paper"
        >
          <span className="font-medium text-ink">What the AI sees</span>
          <br />
          {aiCount} masked payload{aiCount === 1 ? "" : "s"} sent
        </button>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-6xl flex-1 px-8 py-8">{hydrated ? children : <div className="text-muted">Loading…</div>}</main>
        <footer className="no-print border-t border-line px-8 py-3 text-xs text-muted">
          RIPPLE educates and models scenarios. It does not recommend specific securities, stocks, mutual funds or insurance products. Every rupee figure is
          computed by code, never by a language model.
        </footer>
      </div>
      {hydrated && <ProvenanceDrawer />}
      {hydrated && <AiPanel />}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl px-5 py-3 text-sm text-white shadow-lg ${toast.tone === "warn" ? "bg-warn" : "bg-ink"}`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
