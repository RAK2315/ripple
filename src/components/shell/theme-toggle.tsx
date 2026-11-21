"use client";
import { useEffect, useState } from "react";

/** Warm light (default) / warm dark. Persisted in localStorage; applied before paint by the script in layout.tsx. */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.dataset.theme === "dark"), []);
  const set = (d: boolean) => {
    setDark(d);
    if (d) document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem("ripple-theme", d ? "dark" : "light");
    } catch {}
  };
  return (
    <div role="radiogroup" aria-label="Theme" className="flex rounded-md border border-line p-1 text-xs">
      {[
        { d: false, label: "Light" },
        { d: true, label: "Dark" },
      ].map((o) => (
        <button
          key={o.label}
          role="radio"
          aria-checked={dark === o.d}
          onClick={() => set(o.d)}
          className={`flex-1 rounded-md px-2 py-1 transition-colors ${dark === o.d ? "bg-paper font-medium text-ink" : "text-muted hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
