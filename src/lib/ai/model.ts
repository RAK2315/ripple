import { generateText, Output } from "ai";
import { groq } from "@ai-sdk/groq";
import type { z } from "zod";
import { recordCall } from "./meta";

// Groq free tier. gpt-oss models support json_schema structured outputs.
export const MODELS = {
  fast: "openai/gpt-oss-20b",
  smart: "openai/gpt-oss-120b",
} as const;

export const hasKey = () => !!process.env.GROQ_API_KEY;

/** No vision-capable model is available on this Groq key: image/scanned-PDF calls take the fallback path. */
export const hasVision = () => false;

/**
 * One structured model call. Returns null on any failure so callers fall back deterministically.
 * Callers must pass ALREADY MASKED text (see mask.ts).
 * maxRetries uses the AI SDK's exponential backoff, which covers free-tier 429s.
 */
export async function structured<T>(opts: {
  model: keyof typeof MODELS;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  images?: { data: string; mediaType: string }[];
  timeoutMs?: number;
}): Promise<T | null> {
  if (!hasKey()) {
    recordCall("failed");
    return null;
  }
  if (opts.images?.length && !hasVision()) return null;
  try {
    const { output } = await generateText({
      model: groq(MODELS[opts.model]),
      system: opts.system,
      prompt: opts.prompt,
      output: Output.object({ schema: opts.schema }),
      providerOptions: { groq: { structuredOutputs: true, strictJsonSchema: false, reasoningEffort: "low" } },
      temperature: 0,
      abortSignal: AbortSignal.timeout(opts.timeoutMs ?? 45000),
      maxRetries: 3,
    });
    recordCall("ok");
    return output as T;
  } catch (e) {
    console.error("[ai] structured call failed:", (e as Error).message);
    recordCall("failed");
    return null;
  }
}
