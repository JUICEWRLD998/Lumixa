import {
  normalizeScorePayload,
  parseOddsTick,
  type EventHandlers,
  type EventSource,
  type OddsTick,
  type Subscription,
} from '@lumixa/core';
import type { TxlineClient } from './client.js';
import { subscribeOdds, subscribeScores, type StreamSubscription } from './sse.js';
import { logger } from './logger.js';

/** Options for {@link createLiveSource}. */
export interface LiveSourceOptions {
  /**
   * On every SSE (re)connect, fetch an odds snapshot to seed/catch-up state.
   * De-duplicated by `messageId` so it never double-emits ticks the live stream
   * also delivers around the reconnect boundary. Default `true`.
   */
  backfill?: boolean;
}

/**
 * Wrap the live TxLINE SSE feed as an {@link EventSource}, emitting the SAME
 * normalized {@link import('@lumixa/core').MarketEvent}s the replay engine does
 * — so engine / trader / store code is identical live vs. replay.
 *
 * Responsibilities layered on top of the raw SSE subscribers:
 *  - normalize raw payloads via core (`parseOddsTick` / `normalizeScorePayload`);
 *  - **backfill on (re)connect** via `getOddsSnapshot`, de-duplicated by
 *    `messageId` so a reconnect seeds missed state without replaying duplicates;
 *  - expose the push lifecycle (`onOpen` once on first connect, `onClose` on
 *    `stop()`).
 *
 * Backfill is odds-only this phase (scores lack a stable single id). The
 * `messageId` de-dupe `Set` grows for the life of the source — fine for a single
 * fixture over one match.
 *
 * @param client authenticated TxLINE client.
 * @param fixtureId fixture to stream.
 * @param opts backfill toggle.
 */
export function createLiveSource(
  client: TxlineClient,
  fixtureId: number,
  opts: LiveSourceOptions = {},
): EventSource {
  const backfill = opts.backfill ?? true;
  const subscribers = new Set<EventHandlers>();
  const seenOdds = new Set<string>();

  let started = false;
  let openEmitted = false;
  let closeEmitted = false;
  let oddsSub: StreamSubscription | undefined;
  let scoreSub: StreamSubscription | undefined;

  const emitError = (err: unknown): void => {
    for (const h of subscribers) h.onError?.(err);
  };

  /** Emit an odds tick once, suppressing `messageId` duplicates. */
  const emitOdds = (tick: OddsTick): void => {
    if (seenOdds.has(tick.messageId)) return;
    seenOdds.add(tick.messageId);
    for (const h of subscribers) {
      h.onEvent({ kind: 'odds', ts: tick.ts, fixtureId: tick.fixtureId, tick });
    }
  };

  const runBackfill = (): void => {
    client
      .getOddsSnapshot(fixtureId)
      .then((ticks) => {
        for (const tick of ticks) emitOdds(tick);
      })
      .catch((err: unknown) => {
        logger.error({ fixtureId, err }, 'live backfill snapshot failed');
        emitError(err);
      });
  };

  return {
    subscribe(handlers: EventHandlers): Subscription {
      subscribers.add(handlers);
      return {
        close(): void {
          subscribers.delete(handlers);
        },
      };
    },

    start(): void {
      if (started) return;
      started = true;

      oddsSub = subscribeOdds(client, fixtureId, {
        onOpen: () => {
          if (!openEmitted) {
            openEmitted = true;
            for (const h of subscribers) h.onOpen?.();
          }
          if (backfill) runBackfill();
        },
        onOdds: (raw) => {
          try {
            emitOdds(parseOddsTick(raw));
          } catch (err) {
            emitError(err);
          }
        },
        onError: emitError,
      });

      scoreSub = subscribeScores(client, fixtureId, {
        onScore: (raw) => {
          try {
            const event = normalizeScorePayload(raw);
            for (const h of subscribers) {
              h.onEvent({ kind: 'score', ts: event.ts, fixtureId: event.fixtureId, event });
            }
          } catch (err) {
            emitError(err);
          }
        },
        onError: emitError,
      });
    },

    stop(): void {
      oddsSub?.close();
      scoreSub?.close();
      oddsSub = undefined;
      scoreSub = undefined;
      if (!closeEmitted) {
        closeEmitted = true;
        for (const h of subscribers) h.onClose?.();
      }
    },
  };
}
