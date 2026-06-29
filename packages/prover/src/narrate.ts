import OpenAI from 'openai';
import type { Decision } from '@lumixa/core';

/**
 * Best-effort narration layer (`implementation.md` §10): turn a structured
 * decision into a one-line human rationale for the dashboard/demo. It lives
 * strictly OUTSIDE the Sense→Act→Prove path — the decision engine is
 * deterministic code, never an LLM — so narration is cosmetic and MUST NOT be
 * able to break a trade. Every call is wrapped: any failure returns `undefined`.
 *
 * Provider: OpenRouter's OpenAI-compatible API pointed at a Gemini model
 * (configurable via env). Fully swappable because nothing depends on its output.
 */

/** Turns a decision into a rationale string, or `undefined` on any failure. */
export type Narrator = (decision: Decision) => Promise<string | undefined>;

/** Low-level completion: prompt → text. Injectable so tests need no network. */
export type CompletionFn = (prompt: string) => Promise<string | undefined>;

/** Config for the default OpenRouter→Gemini narrator (read from env by callers). */
export interface NarrateConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
}

/** Build the one-line narration prompt for a decision. */
function promptFor(d: Decision): string {
  return (
    `In one sentence, explain this sports-trading decision for a dashboard. ` +
    `Backed "${d.side}" in the ${d.market} market on fixture ${d.fixtureId} at ${d.price.toFixed(2)} ` +
    `(fair ${d.entryPct.toFixed(1)}%), triggered by a steam move originating at book ${d.leaderBook} ` +
    `while the consensus still lagged. Be concise and factual; no hype.`
  );
}

/**
 * Default completion backed by the `openai` SDK pointed at OpenRouter. Returns a
 * no-op (always `undefined`) when no API key is configured, so narration is
 * silently skipped rather than erroring in offline/dev runs.
 */
function defaultComplete(cfg: NarrateConfig): CompletionFn {
  if (!cfg.apiKey) return async () => undefined;
  const client = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL });
  const model = cfg.model ?? 'google/gemini-2.5-flash';
  return async (prompt) => {
    const res = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 80,
    });
    return res.choices[0]?.message?.content?.trim() || undefined;
  };
}

/**
 * Create a {@link Narrator}. Pass `complete` to inject a completion function
 * (tests, alternative providers); otherwise the default OpenRouter client is
 * used. The returned narrator never throws — it returns `undefined` on failure.
 */
export function createNarrator(cfg: NarrateConfig = {}, complete?: CompletionFn): Narrator {
  const fn = complete ?? defaultComplete(cfg);
  return async (decision) => {
    try {
      return await fn(promptFor(decision));
    } catch {
      return undefined;
    }
  };
}
