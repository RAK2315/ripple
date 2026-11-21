"use client";
import { useStore } from "@/lib/store";
import { useUi } from "@/lib/ui";

export function AiPanel() {
  const open = useUi((s) => s.aiPanel);
  const setOpen = useUi((s) => s.setAiPanel);
  const log = useStore((s) => s.aiLog);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink/20" onClick={() => setOpen(false)}>
      <div className="h-full w-[560px] overflow-y-auto bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">Privacy</div>
            <h3 className="mt-1 text-lg font-semibold">What the AI sees</h3>
          </div>
          <button onClick={() => setOpen(false)} className="text-muted hover:text-ink">
            ✕
          </button>
        </div>
        <p className="mt-2 text-sm text-muted">
          The exact text sent to the model, after masking. Account and card numbers become <code>XX1234</code>, phone numbers become <code>[PHONE]</code>,
          people&apos;s names become <code>[NAME]</code>. Nothing the model returns is ever shown as a rupee figure.
        </p>
        {log.length === 0 && <p className="mt-6 text-sm text-muted">Nothing has been sent yet.</p>}
        {log.map((l) => (
          <div key={l.id} className="mt-5">
            <div className="mb-1 flex justify-between text-xs text-muted">
              <span className="font-mono">{l.route}</span>
              <span>{new Date(l.at).toLocaleTimeString()}</span>
            </div>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-paper p-3 font-mono text-[11px] leading-relaxed">{l.masked_payload}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
