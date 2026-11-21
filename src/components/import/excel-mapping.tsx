"use client";
import { useMemo, useState } from "react";
import { analyzeSheets, parseSheet, readWorkbook, type ColumnMap, type Sheet, type SheetAnalysis, type XlsxParse } from "@/lib/ingest/xlsx";

export interface ExcelState {
  fileName: string;
  sheets: Sheet[];
  analysis: SheetAnalysis;
  parse: (map: ColumnMap) => XlsxParse;
}

/** Read an .xlsx/.xls in the browser. Nothing is uploaded. */
export async function readExcel(file: File): Promise<ExcelState> {
  const sheets = await readWorkbook(new Uint8Array(await file.arrayBuffer()));
  if (!sheets.length) throw new Error("This workbook has no sheets.");
  const analysis = analyzeSheets(sheets);
  return { fileName: file.name, sheets, analysis, parse: (map) => parseSheet(analysis, map, file.name) };
}

const sel = "rounded-md border border-line bg-raised px-2 py-1 text-sm";

/** Shown only when a required column could not be identified: the user points at date, amount and description. */
export function ExcelMapping({ state, onImport, onCancel }: { state: ExcelState; onImport: (r: XlsxParse) => void; onCancel: () => void }) {
  const [sheetName, setSheetName] = useState(state.analysis.sheet.name);
  const analysis = useMemo(() => analyzeSheets(state.sheets, sheetName), [state.sheets, sheetName]);
  const [map, setMap] = useState<ColumnMap>(analysis.map);
  const [mode, setMode] = useState<"signed" | "split">(analysis.map.amount < 0 && (analysis.map.debit >= 0 || analysis.map.credit >= 0) ? "split" : "signed");
  const cols = analysis.header.map((h, i) => ({ i, label: h || `Column ${String.fromCharCode(65 + i)}` }));
  const preview = analysis.sheet.rows.slice(analysis.headerIdx + 1).filter((r) => r.some((c) => String(c ?? "").trim())).slice(0, 3);
  const ready = map.date >= 0 && map.description >= 0 && (mode === "signed" ? map.amount >= 0 : map.debit >= 0 || map.credit >= 0);

  const pick = (key: keyof ColumnMap, label: string, optional = false) => (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <select className={sel} value={map[key]} onChange={(e) => setMap({ ...map, [key]: +e.target.value })}>
        <option value={-1}>{optional ? "(none)" : "Choose a column…"}</option>
        {cols.map((c) => (
          <option key={c.i} value={c.i}>
            {c.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="mt-5 rounded-md border border-warn/40 bg-warn-soft p-4" data-testid="excel-mapping">
      <div className="text-sm">
        <b>Point us at the columns.</b>{" "}
        <span className="text-muted">
          We couldn&apos;t identify {analysis.missing.length ? analysis.missing.join(", ") : "the header row"} in <b>{state.fileName}</b>.
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Sheet
          <select
            className={sel}
            value={sheetName}
            onChange={(e) => {
              setSheetName(e.target.value);
              setMap(analyzeSheets(state.sheets, e.target.value).map);
            }}
          >
            {state.analysis.sheets.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name} ({s.dateRows} dated rows)
              </option>
            ))}
          </select>
        </label>
        {pick("date", "Date")}
        {pick("description", "Description")}
        <label className="flex flex-col gap-1 text-xs text-muted">
          Amounts are
          <select className={sel} value={mode} onChange={(e) => setMode(e.target.value as "signed" | "split")}>
            <option value="signed">one signed column</option>
            <option value="split">separate debit / credit</option>
          </select>
        </label>
        {mode === "signed" ? pick("amount", "Amount (− = debit)") : (
          <>
            {pick("debit", "Debit / withdrawal", true)}
            {pick("credit", "Credit / deposit", true)}
          </>
        )}
        {pick("time", "Time", true)}
      </div>
      {preview.length > 0 && (
        <table className="mt-3 w-full text-xs">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.i} className="py-1 pr-3 text-left">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((r, k) => (
              <tr key={k} className="border-t border-line">
                {cols.map((c) => (
                  <td key={c.i} className="py-1 pr-3">
                    {r[c.i] instanceof Date ? (r[c.i] as Date).toLocaleDateString("en-IN") : String(r[c.i] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="mt-3 flex gap-2">
        <button
          disabled={!ready}
          onClick={() => onImport(parseSheet(analysis, mode === "signed" ? { ...map, debit: -1, credit: -1 } : { ...map, amount: -1 }, state.fileName))}
          className="rounded-md bg-ink px-4 py-2 text-sm text-paper disabled:opacity-40"
        >
          Import with this mapping
        </button>
        <button onClick={onCancel} className="rounded-md border border-line px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}
