"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useHydrated } from "@/lib/derived";
import { useStore } from "@/lib/store";
import { useUi } from "@/lib/ui";
import { ProvenanceDrawer } from "./provenance-drawer";
import { AiPanel } from "./ai-panel";
import { CoachDrawer } from "@/components/coach/coach-drawer";
import { InvestigateDrawer, useInvestigate } from "@/components/investigate/investigate-drawer";
import { ThemeToggle } from "./theme-toggle";
import { ErrorBoundary, RecoveryScreen } from "./recovery";
import { AiStatusPill, ClearedNotice, IncomeBanner } from "./status-strip";
import { useStorageHealth } from "@/lib/storage-health";
import { Mark } from "./mark";
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
  const storage = useStorageHealth((s) => s.problem);
  const broken = storage === "corrupt" || storage === "invalid";
  // ?demo=1 loads the demo profile on a fresh browser (used for screenshots and the reset path)
  useEffect(() => {
    if (!hydrated) return;
    if (new URLSearchParams(window.location.search).get("demo") === "1" && useStore.getState().transactions.length === 0) {
      useStore.getState().loadFixture();
      categorizeUnmatched();
    }
  }, [hydrated]);
  // Escape closes any open drawer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const ui = useUi.getState();
      ui.closeProvenance();
      ui.setAiPanel(false);
      ui.setCoach(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="flex min-h-screen">
      <aside className="no-print sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-line bg-card px-4 py-6">
        <Link href="/" className="mb-8 block px-2">
          <div className="flex items-center gap-2">
            <Mark size={28} />
            <span className="font-display text-[30px] leading-none tracking-tight">
              Ripple<span className="text-accent">.</span>
            </span>
          </div>
          <div className="mt-2 text-xs leading-snug text-muted">See where your money is going, and where it ends up.</div>
        </Link>
        <nav className="flex flex-col gap-1" aria-label="Main">
          {NAV.map((n) => {
            const on = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={on ? "page" : undefined}
                className={`relative rounded-md px-3 py-2 text-sm transition-colors ${
                  on ? "bg-paper font-medium text-ink" : "text-muted hover:bg-paper hover:text-ink"
                }`}
              >
                {on && <span className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-accent" aria-hidden />}
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto space-y-2">
          <button
            onClick={() => useUi.getState().setCoach(true)}
            className="w-full rounded-md bg-ink px-3 py-3 text-left text-sm font-medium text-paper transition-opacity hover:opacity-90"
          >
            Ask RIPPLE
          </button>
          <button
            onClick={() => useInvestigate.getState().setOpen(true)}
            className="w-full rounded-md border border-ink px-3 py-2 text-left text-sm font-medium text-ink transition-colors hover:bg-paper"
          >
            Investigate
          </button>
          <button
            onClick={() => setAiPanel(true)}
            className="w-full rounded-md border border-line px-3 py-2 text-left text-xs text-muted transition-colors hover:border-line-strong hover:bg-paper"
          >
            <span className="font-medium text-ink">What the AI sees</span>
            <br />
            <span className="num text-xs">{aiCount}</span> masked payload{aiCount === 1 ? "" : "s"} sent
          </button>
          <AiStatusPill />
          <ThemeToggle />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-6xl flex-1 px-8 py-8">
          {broken ? (
            <RecoveryScreen
              title="Your saved RIPPLE data couldn't be read"
              detail="It was probably saved by an earlier version of the app, or got corrupted. Resetting clears it and reloads the demo profile; nothing leaves your browser."
            />
          ) : hydrated ? (
            <ErrorBoundary key={path}>
              <ClearedNotice />
              <ErrorBoundary compact>
                <IncomeBanner />
              </ErrorBoundary>
              {children}
            </ErrorBoundary>
          ) : (
            <PageSkeleton />
          )}
        </main>
        <footer className="no-print border-t border-line px-8 py-3 text-xs text-faint">
          RIPPLE educates and models scenarios. It does not recommend specific securities, stocks, mutual funds or insurance products. Every rupee figure is
          computed by code, never by a language model.
        </footer>
      </div>
      {hydrated && !broken && (
        <ErrorBoundary compact>
          <InvestigateDrawer />
          <ProvenanceDrawer />
          <AiPanel />
          <CoachDrawer />
        </ErrorBoundary>
      )}
      {toast && (
        <div
          role="status"
          className={`fade-in fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md px-5 py-3 text-sm text-paper shadow-lg ${toast.tone === "warn" ? "bg-warn" : "bg-ink"}`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

/** One header for every screen: serif title + one muted line on what the screen is for. */
export function PageHeader({ title, sub, eyebrow, right }: { title: string; sub?: React.ReactNode; eyebrow?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-6">
      <div>
        {eyebrow && <div className="mb-1 text-xs uppercase tracking-wide text-faint">{eyebrow}</div>}
        <h1>{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-9 w-64" />
      <div className="skeleton h-4 w-96" />
      <div className="grid grid-cols-3 gap-6">
        <div className="skeleton h-36" />
        <div className="skeleton h-36" />
        <div className="skeleton h-36" />
      </div>
      <div className="skeleton h-96" />
    </div>
  );
}
