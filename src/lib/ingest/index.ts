"use client";
/**
 * THE swap point for Kirti's module. Today: fallback parsers. At integration:
 *   import { parseSms, parseCsv } from "../../../kirti";
 * and route through them instead. Nothing else in src/ imports parsers.
 */
import type { ParseResult, SmsLlmFallback, SmsLlmRow } from "../../../contract/types";
import { fallbackParseCsv, fallbackParseSms } from "./fallback";
import { callApi } from "../api";

/** The app's LLM fallback: masked server-side, logged in "What the AI sees". */
const llmFallback: SmsLlmFallback = async (messages) => {
  const res = await callApi<(SmsLlmRow | null)[]>("sms-fallback", { messages });
  return res.ok && res.data ? res.data : messages.map(() => null);
};

export async function ingestSms(text: string): Promise<ParseResult> {
  return fallbackParseSms(text, { llmFallback });
}

export async function ingestCsv(text: string, fileName: string): Promise<ParseResult> {
  return fallbackParseCsv(text, { sourceFile: fileName });
}
