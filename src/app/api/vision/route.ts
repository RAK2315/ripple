import { aiRoute } from "@/lib/ai/meta";
import { z } from "zod";
import { extractText, getDocumentProxy } from "unpdf";
import { mask } from "@/lib/ai/mask";
import { protect } from "@/lib/ai/protect";
import { parsePdfText } from "@/lib/ingest/pdf-text";
import { hasVision, structured } from "@/lib/ai/model";

export const maxDuration = 180;

const schema = z.object({
  rows: z.array(
    z.object({
      date: z.string().describe("YYYY-MM-DD; Indian dates are day-first"),
      amount_rupees: z.number().describe("exactly as printed, positive"),
      direction: z.enum(["debit", "credit"]),
      description: z.string().describe("merchant / payee / narration as printed"),
    }),
  ),
});

const SYSTEM = `You read Indian bank statements and UPI app history screens (GPay, PhonePe, Paytm) and list every transaction row. Copy amounts exactly as printed; never compute, total or guess. Paid/sent/debit = debit; received/credited/refund = credit. If the year is missing assume 2026. Skip balance rows, headers and totals.`;

/** Extraction only: the model transcribes printed rows. Every total in RIPPLE is still computed by our code. */
export const POST = aiRoute(async function POST(req: Request) {
  const { kind, data, mediaType, fileName, _names } = (await req.json()) as { kind: "pdf" | "image"; data: string; mediaType: string; fileName: string; _names?: string[] };
  // the client tokenizes every name it knows before sending; file bytes can't be, so the extracted text gets the same treatment here
  const guard = protect("", Array.isArray(_names) ? _names.filter((n) => typeof n === "string") : []);
  let masked = "";
  let res: z.infer<typeof schema> | null = null;
  let path = "";
  if (kind === "pdf") {
    let text = "";
    try {
      const pdf = await getDocumentProxy(new Uint8Array(Buffer.from(data, "base64")));
      text = (await extractText(pdf, { mergePages: true })).text as string;
    } catch {
      text = "";
    }
    const usable = text.replace(/\s/g, "").length > 200 && /\d{1,2}[/-]\w{2,3}[/-]\d{2,4}/.test(text);
    if (usable) {
      path = "text-layer";
      const names = protect(text, Array.isArray(_names) ? _names.filter((n) => typeof n === "string") : []);
      guard.restore = names.restore;
      masked = mask(names.body as string).slice(0, 60000);
      // one call per ~15 rows, in parallel: a single long call drops rows
      const starts = [...masked.matchAll(/\b\d{1,2}[/-](?:[A-Za-z]{3}|\d{1,2})[/-]\s*\d{2,4}/g)].map((m) => m.index!);
      const header = masked.slice(0, starts[0] ?? 0).slice(0, 400);
      const chunks: string[] = [];
      for (let i = 0; i < starts.length; i += 15) chunks.push(masked.slice(starts[i], starts[i + 15] ?? masked.length));
      const parts = await Promise.all(
        (chunks.length ? chunks : [masked]).map((c) =>
          // short timeout: on a quota error the deterministic floor below answers instead of a multi-minute retry wait
          structured({ model: "smart", system: SYSTEM, prompt: `Statement header:\n${header}\n\nRows:\n${c}`, schema, timeoutMs: 30000 }),
        ),
      );
      const okParts = parts.filter((p) => p !== null);
      if (okParts.length === parts.length) res = { rows: okParts.flatMap((p) => p.rows) };
      else {
        // floor: no model, our own parser over the same text, so a PDF never dies with the quota
        const det = parsePdfText(text, fileName);
        if (det.transactions.length)
          return Response.json({
            ok: true,
            data: { transactions: det.transactions, unparsed: det.unparsed, path: `text-layer, read by RIPPLE's own parser (model unavailable for ${parts.length - okParts.length} of ${parts.length} chunks)` },
            masked,
            degraded: true,
          });
        res = okParts.length ? { rows: okParts.flatMap((p) => p.rows) } : null;
        path = `text-layer (${parts.length - okParts.length} of ${parts.length} chunks failed)`;
      }
    } else if (!hasVision()) {
      return Response.json({ ok: false, error: "This PDF has no text layer (scanned). Reading scanned pages needs a vision model, which this deployment does not have. Paste the bank SMS or upload the CSV instead." });
    } else {
      path = "scanned → vision";
      masked = `[scanned PDF sent as page images: ${fileName}, ${Math.round((data.length * 0.75) / 1024)} KB — pixels cannot be text-masked]`;
      res = await structured({ model: "smart", system: SYSTEM, prompt: "List every transaction in this statement.", schema, images: [{ data, mediaType: "application/pdf" }], timeoutMs: 150000 });
    }
  } else {
    if (!hasVision()) return Response.json({ ok: false, error: "Reading screenshots needs a vision model, which this deployment does not have (free-tier key). Paste the bank SMS or upload the CSV instead." });
    path = "vision";
    masked = `[image sent to vision model: ${fileName}, ${Math.round((data.length * 0.75) / 1024)} KB — pixels cannot be text-masked]`;
    res = await structured({ model: "smart", system: SYSTEM, prompt: "List every transaction visible in this screenshot.", schema, images: [{ data, mediaType }], timeoutMs: 120000 });
  }
  if (!res) return Response.json({ ok: false, error: "The model could not read this file. Try SMS or CSV.", masked });
  const sourceKind = kind === "pdf" ? "pdf" : "upi_screenshot";
  const transactions = guard.restore(res.rows)
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.amount_rupees > 0)
    .map((r, i) => ({
      id: `${kind === "pdf" ? "pdf" : "upi"}_${String(i + 1).padStart(4, "0")}`,
      date: r.date,
      amount: Math.round(r.amount_rupees * 100),
      direction: r.direction,
      raw_description: r.description.replace(/\s+/g, " ").trim() || "UNKNOWN",
      account_tail: null,
      source_kind: sourceKind,
      source_file: fileName,
      source_line: `${r.date} | ${r.description} | ${r.direction} ${r.amount_rupees}`,
      merchant_normalized: null,
      category: null,
      category_source: null,
      confidence: null,
    }));
  return Response.json({ ok: true, data: { transactions, path }, masked });
});
