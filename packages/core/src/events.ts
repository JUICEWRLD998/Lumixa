import type { OddsTick } from './odds.js';
import type { ScoreEvent } from './scores.js';

/**
 * The normalized event model shared by EVERY producer and consumer in the
 * Sense → Act → Prove pipeline. The whole point of this contract is the Phase-1
 * exit criterion: a downstream consumer (engine, trader, store) sees the SAME
 * stream whether events come from the live SSE feed or from a recorded corpus
 * replayed offline.
 *
 * Two implementations of {@link EventSource} exist:
 *  - the LIVE source (`@lumixa/ingest`) wraps the SSE subscribers; and
 *  - the REPLAY source (`@lumixa/replay`) drives a virtual clock over a corpus.
 *
 * ─── `ts` provenance (important, subtle) ────────────────────────────────────
 * The SHAPE of every event is identical across both sources, but `ts` means
 * slightly different things:
 *  - REPLAY: the corpus envelope's CAPTURE time (the replay clock's time base,
 *    see `record.ts`). This is what makes replay ordering deterministic.
 *  - LIVE: the underlying event's OWN time (`OddsTick.ts` / `ScoreEvent.ts`).
 * Consumers that need wall-clock-of-capture vs event-time must read `tick.ts` /
 * `event.ts` explicitly rather than assuming `MarketEvent.ts` is one or other.
 */

/** A single normalized event flowing through the pipeline. */
export type MarketEvent =
  | { kind: 'odds'; ts: number; fixtureId: number; tick: OddsTick }
  | { kind: 'score'; ts: number; fixtureId: number; event: ScoreEvent }
  /** lifecycle: a fixture's stream began (replay: corpus `meta` line) */
  | { kind: 'start'; ts: number; fixtureId: number; meta?: unknown }
  /** lifecycle: the stream ended (replay: end-of-corpus; never fires live) */
  | { kind: 'end'; ts: number; fixtureId: number };

/** Discriminant kinds of {@link MarketEvent}. */
export type MarketEventKind = MarketEvent['kind'];

/** Callbacks an {@link EventSource} delivers to. Mirrors the SSE handler shape. */
export interface EventHandlers {
  /** one normalized event */
  onEvent: (ev: MarketEvent) => void;
  /** transport/parse error (non-fatal; source decides whether to continue) */
  onError?: (err: unknown) => void;
  /** source became active (live: SSE open; replay: clock started) */
  onOpen?: () => void;
  /** source finished (replay: end-of-corpus; live: on `stop()`) */
  onClose?: () => void;
}

/** Handle returned by {@link EventSource.subscribe}; `close()` detaches. */
export interface Subscription {
  close(): void;
}

/**
 * A push-based source of {@link MarketEvent}s. Push (not pull/async-iterator)
 * because the live feed is inherently push — determinism for replay comes from
 * the source controlling emission order, not from the consumer pulling.
 *
 * Lifecycle: `subscribe()` registers handlers (may be called before `start()`);
 * `start()` begins emission (idempotent); `stop()` halts it and cancels any
 * pending timers / closes the underlying transport (idempotent).
 */
export interface EventSource {
  subscribe(handlers: EventHandlers): Subscription;
  start(): void;
  stop(): void;
}
