import { generateText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { z } from "zod";

export const MODELS = {
  fast: "claude-haiku-5-5",
  smart: "claude-sonnet-5-5",
} as const;

export const hasKey = () => !!process.env.ANTHROPIC_API_KEY;

/**
 * One structured model call. Returns null on any failure so callers fall back deterministically.
 * Callers must pass ALREADY MASKED text (see mask.ts).
 */
export async function structured<T>(opts: {
  model: keyof typeof MODELS;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  images?: { data: string; mediaType: string }[];
  timeoutMs?: number;
}): Promise<T | null> {
  if (!hasKey()) return null;
  try {
    const content: Array<{ type: "text"; text: string } | { type: "file"; data: string; mediaType: string }> = [
      ...(opts.images ?? []).map((i) => ({ type: "file" as const, data: i.data, mediaType: i.mediaType })),
      { type: "text", text: opts.prompt },
    ];
    const { output } = await generateText({
      model: anthropic(MODELS[opts.model]),
      system: opts.system,
      messages: [{ role: "user", content }],
      output: Output.object({ schema: opts.schema }),
      abortSignal: AbortSignal.timeout(opts.timeoutMs ?? 45000),
      maxRetries: 1,
    });
    return output as T;
  } catch (e) {
    console.error("[ai] structured call failed:", (e as Error).message);
    return null;
  }
}
