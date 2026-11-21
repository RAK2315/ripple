import { generateText, Output } from "ai";
import { groq } from "@ai-sdk/groq";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { z } from "zod";
import { recordCall } from "./meta";

// Groq free tier. gpt-oss models support json_schema structured outputs.
export const MODELS = {
  fast: "openai/gpt-oss-20b",
  smart: "openai/gpt-oss-120b",
} as const;

export const hasKey = () => !!process.env.GROQ_API_KEY;

/**
 * Fallback provider: Google Gemini, used only when a Groq call fails (quota, rate limit, any provider error) or no
 * Groq key is set. Same prompt, same schema, same masking: the call is recorded as "fallback", so the sidebar
 * says "Running on fallback model". GEMINI_API_KEY enables it; GEMINI_MODEL overrides the model.
 */
export const hasFallback = () => !!process.env.GEMINI_API_KEY;
export const fallbackModelId = () => process.env.GEMINI_MODEL || "gemini-3.8-flash";
export function fallbackModel() {
  return createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY })(fallbackModelId());
}

/** No vision-capable model is wired on the vision path yet: image/scanned-PDF calls take the fallback message. */
export const hasVision = () => false;

/**
 * One structured model call. Returns null on any failure so callers fall back deterministically.
 * Callers must pass ALREADY MASKED text (see mask.ts).
 * Order: Groq → Gemini (if GEMINI_API_KEY) → null (the caller's template/heuristic).
 */
export async function structured<T>(opts: {
  model: keyof typeof MODELS;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  images?: { data: string; mediaType: string }[];
  timeoutMs?: number;
}): Promise<T | null> {
  if (opts.images?.length && !hasVision()) return null;
  if (hasKey()) {
    try {
      const { output } = await generateText({
        model: groq(MODELS[opts.model]),
        system: opts.system,
        prompt: opts.prompt,
        output: Output.object({ schema: opts.schema }),
        providerOptions: { groq: { structuredOutputs: true, strictJsonSchema: false, reasoningEffort: "low" } },
        temperature: 0,
        abortSignal: AbortSignal.timeout(opts.timeoutMs ?? 45000),
        // with a fallback provider, don't sit in backoff on a quota error: hand over quickly
        maxRetries: hasFallback() ? 1 : 3,
      });
      recordCall("ok");
      return output as T;
    } catch (e) {
      console.error("[ai] structured call failed (groq):", (e as Error).message.slice(0, 200));
    }
  }
  if (hasFallback()) {
    try {
      const { output } = await generateText({
        model: fallbackModel(),
        system: opts.system,
        prompt: opts.prompt,
        output: Output.object({ schema: opts.schema }),
        temperature: 0,
        abortSignal: AbortSignal.timeout(opts.timeoutMs ?? 45000),
        maxRetries: 2,
      });
      recordCall("fallback");
      return output as T;
    } catch (e) {
      console.error("[ai] structured call failed (gemini):", (e as Error).message.slice(0, 200));
    }
  }
  recordCall("failed");
  return null;
}
