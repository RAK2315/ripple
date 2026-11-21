"use client";
import Link from "next/link";
import { useState } from "react";
import type { ParseResult, Transaction, UnparsedRow } from "../../../contract/types";
import { useStore } from "@/lib/store";
import { useDerived } from "@/lib/derived";
import { ingestCsv, ingestSms } from "@/lib/ingest";
import { categorizeUnmatched } from "@/lib/actions";
import { callApi } from "@/lib/api";
import { LOW_CONFIDENCE } from "@/lib/config";

type Tab = "sms" | "csv" | "pdf" | "upi";
const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "sms", label: "Bank SMS", hint: "Paste a dump of HDFC, ICICI, SBI or Axis alerts. Blank line between messages." },
  { id: "csv", label: "CSV", hint: "Any bank export. We detect the date, amount and description columns, and debit/credit or signed amounts." },
  { id: "pdf", label: "PDF", hint: "Text layer first; scanned pages go to a vision model. No layout parser." },
  { id: "upi", label: "UPI screenshot", hint: "A GPay or PhonePe history screen." },
];

interface Summary {
  source: string;
  parsed: number;
  added: number;
  duplicates: number;
  unparsed: UnparsedRow[];
  viaLlm: number;
  path?: string;
}

export function ImportScreen() {
  const [tab, setTab] = useState<Tab>("sms");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const store = useStore();
  const d = useDerived();

  async function finish(result: ParseResult, source: string, path?: string) {
    const { added, duplicates } = store.addTransactions(result.transactions, source, result.unparsed.length);
    setSummary({ source, parsed: result.stats.parsed, added, duplicates, unparsed: result.unparsed, viaLlm: result.stats.via_llm, path });
    setBusy("Categorizing: learned rules → starter merchant list → model for the rest…");
    await categorizeUnmatched();
    setBusy(null);
  }

  async function run(fn: () => Promise<void>) {
    setError(null);
    setSummary(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function onFile(file: File) {
    if (tab === "csv") {
      return run(async () => {
        setBusy("Parsing CSV…");
        await finish(await ingestCsv(await file.text(), file.name), file.name);
      });
    }
    return run(async () => {
      setBusy(tab === "pdf" ? "Reading PDF…" : "Reading screenshot with the vision model…");
      const data = await toBase64(file);
      const res = await callApi<{ transactions: Transaction[]; path: string }>("vision", { kind: tab === "pdf" ? "pdf" : "image", data, mediaType: file.type || "image/png", fileName: file.name });
      if (!res.ok || !res.data) throw new Error(res.error ?? "Could not read the file.");
      const t = res.data.transactions;
      await finish({ transactions: t, unparsed: [], stats: { total_inputs: t.length, parsed: t.length, unparsed: 0, via_llm: t.length } }, file.name, res.data.path);
    });
  }

  const review = d.categorized.filter((t) => (t.confidence ?? 0) < LOW_CONFIDENCE && t.category_source !== "user").length;
  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Import</h1>
          <p className="text-sm text-muted">This is how most Indians actually see their money, so this is where we start.</p>
        </div>
        <button
          onClick={() => {
            if (confirm("Clear all data, rules and scenarios and start fresh?")) {
              store.resetDemo();
              setSummary(null);
            }
          }}
          className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:text-ink"
        >
          Reset demo
        </button>
      </div>

      <div className="card p-6">
        <div className="mb-4 flex gap-1 rounded-lg bg-paper p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id);
                setText("");
              }}
              className={`flex-1 rounded-md px-3 py-2 text-sm ${tab === t.id ? "bg-card font-medium shadow-sm" : "text-muted"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="mb-3 text-sm text-muted">{current.hint}</p>

        {tab === "sms" && (
          <>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"Sent Rs.412.00\nFrom HDFC Bank A/C *4821\nTo SWIGGY\nOn 14/11/26\n…"}
              className="h-64 w-full rounded-lg border border-line bg-paper p-3 font-mono text-xs outline-none focus:border-ink"
            />
            <div className="mt-3 flex items-center gap-3">
              <button
                disabled={!text.trim() || !!busy}
                onClick={() =>
                  run(async () => {
                    setBusy("Parsing messages…");
                    await finish(await ingestSms(text), "sms-paste");
                  })
                }
                className="rounded-lg bg-ink px-5 py-2 text-sm text-white disabled:opacity-40"
              >
                Parse messages
              </button>
              <button
                onClick={async () => setText(await (await fetch("/demo/sms-dump.txt")).text())}
                className="text-sm text-muted underline underline-offset-4 hover:text-ink"
              >
                Use demo SMS dump
              </button>
            </div>
          </>
        )}

        {tab === "csv" && (
          <div className="flex items-center gap-4">
            <FilePick accept=".csv,text/csv" onFile={onFile} disabled={!!busy} />
            <button
              onClick={() =>
                run(async () => {
                  setBusy("Parsing CSV…");
                  const csv = await (await fetch("/demo/statement.csv")).text();
                  await finish(await ingestCsv(csv, "statement.csv"), "statement.csv");
                })
              }
              className="text-sm text-muted underline underline-offset-4 hover:text-ink"
            >
              Use demo statement.csv
            </button>
          </div>
        )}
        {tab === "pdf" && <FilePick accept="application/pdf" onFile={onFile} disabled={!!busy} />}
        {tab === "upi" && <FilePick accept="image/*" onFile={onFile} disabled={!!busy} />}

        {busy && <div className="mt-4 animate-pulse text-sm text-accent">{busy}</div>}
        {error && <div className="mt-4 rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</div>}
      </div>

      {summary && (
        <div className="card p-6">
          <div className="grid grid-cols-4 gap-4">
            <Big label="Parsed" value={summary.parsed} />
            <Big label="Added" value={summary.added} sub={summary.duplicates ? `${summary.duplicates} duplicates skipped` : undefined} />
            <Big label="Categorized" value={d.categorized.length - review} tone="accent" />
            <Big label="Need review" value={review} tone="warn" />
          </div>
          {summary.viaLlm > 0 && <p className="mt-3 text-xs text-muted">{summary.viaLlm} rows read by the model{summary.path ? ` (${summary.path})` : ""}. Masked payload in “What the AI sees”.</p>}
          {summary.unparsed.length > 0 && (
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer text-warn">{summary.unparsed.length} inputs could not be parsed (never silently dropped)</summary>
              <ul className="mt-2 space-y-1">
                {summary.unparsed.map((u) => (
                  <li key={u.index} className="font-mono text-xs text-muted">
                    #{u.index} · {u.reason} · {u.raw.slice(0, 100)}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="mt-5 flex gap-3">
            <Link href="/review" className="rounded-lg bg-ink px-5 py-2 text-sm text-white">
              Review {review} uncertain
            </Link>
            <Link href="/" className="rounded-lg border border-line px-5 py-2 text-sm">
              See your flow
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Big({ label, value, sub, tone }: { label: string; value: number; sub?: string; tone?: "accent" | "warn" }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className={`num text-3xl font-semibold ${tone === "accent" ? "text-accent" : tone === "warn" ? "text-warn" : ""}`}>{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

function FilePick({ accept, onFile, disabled }: { accept: string; onFile: (f: File) => void; disabled: boolean }) {
  return (
    <label className={`inline-flex cursor-pointer items-center rounded-lg bg-ink px-5 py-2 text-sm text-white ${disabled ? "opacity-40" : ""}`}>
      Choose file
      <input type="file" accept={accept} className="hidden" disabled={disabled} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
    </label>
  );
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
