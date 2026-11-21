import { z } from "zod";
import { extractText, getDocumentProxy } from "unpdf";
import { mask } from "@/lib/ai/mask";
import { structured } from "@/lib/ai/model";

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
export async function POST(req: Request) {
  const { kind, data, mediaType, fileName } = (await req.json()) as { kind: "pdf" | "image"; data: string; mediaType: string; fileName: string };
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
      masked = mask(text).slice(0, 60000);
      res = await structured({ model: "smart", system: SYSTEM, prompt: `Statement text:\n${masked}`, schema, timeoutMs: 120000 });
    } else {
      path = "scanned → vision";
      masked = `[scanned PDF sent as page images: ${fileName}, ${Math.round((data.length * 0.75) / 1024)} KB — pixels cannot be text-masked]`;
      res = await structured({ model: "smart", system: SYSTEM, prompt: "List every transaction in this statement.", schema, images: [{ data, mediaType: "application/pdf" }], timeoutMs: 150000 });
    }
  } else {
    path = "vision";
    masked = `[image sent to vision model: ${fileName}, ${Math.round((data.length * 0.75) / 1024)} KB — pixels cannot be text-masked]`;
    res = await structured({ model: "smart", system: SYSTEM, prompt: "List every transaction visible in this screenshot.", schema, images: [{ data, mediaType }], timeoutMs: 120000 });
  }
  if (!res) return Response.json({ ok: false, error: "The model could not read this file. Try SMS or CSV.", masked });
  const sourceKind = kind === "pdf" ? "pdf" : "upi_screenshot";
  const transactions = res.rows
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
}
