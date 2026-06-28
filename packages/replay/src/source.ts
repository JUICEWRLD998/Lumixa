import type { EventHandlers, EventSource, MarketEvent, Subscription } from '@lumixa/core';
import { loadCorpusEvents } from './clock.js';

/** Options for {@link createReplaySource}. */
export interface ReplayOptions {
  /**
   * Virtual-clock multiplier. `Infinity` (the default) drains synchronously and
   * deterministically — used by tests and instant backfills. A finite value
   * `>0` replays in real time scaled by the factor (`30` ⇒ 30× faster).
   */
  replaySpeed?: number;
}

/**
 * Build an {@link EventSource} that replays a pre-ordered {@link MarketEvent}
 * list through a virtual clock. The list should already be time-ordered (use
 * {@link loadCorpusEvents} / `eventsFromLines`).
 *
 * Emission model:
 *  - `replaySpeed: Infinity` → a SYNCHRONOUS drain (no timers at all). This is
 *    what guarantees two replays of the same corpus produce identical event
 *    arrays. (A 0-delay `setTimeout` would still defer to a later macrotask and
 *    break that guarantee, so `Infinity` is a distinct code path.)
 *  - finite `replaySpeed` → a single in-flight `setTimeout` on an ABSOLUTE
 *    schedule (`baseReal + (ev.ts - baseVirtual) / replaySpeed`) so timing does
 *    not drift over a long match.
 *
 * `stop()` cancels any pending timer and emits `onClose` exactly once; it is
 * honored mid-drain (a handler that calls `stop()` halts further emission).
 *
 * @param events time-ordered events to replay (terminated by a `kind:'end'`).
 * @param opts   replay speed.
 */
export function createReplaySource(
  events: readonly MarketEvent[],
  opts: ReplayOptions = {},
): EventSource {
  const replaySpeed = opts.replaySpeed ?? Infinity;
  if (!(replaySpeed > 0)) {
    throw new Error(`createReplaySource: replaySpeed must be > 0, got ${replaySpeed}`);
  }

  const subscribers = new Set<EventHandlers>();
  type State = 'idle' | 'running' | 'done';
  let state: State = 'idle';
  let closeEmitted = false;
  let cursor = 0;
  let pendingTimer: ReturnType<typeof setTimeout> | undefined;

  const emitEvent = (ev: MarketEvent): void => {
    for (const h of subscribers) h.onEvent(ev);
  };
  const emitOpen = (): void => {
    for (const h of subscribers) h.onOpen?.();
  };
  const finish = (): void => {
    if (closeEmitted) return;
    closeEmitted = true;
    state = 'done';
    if (pendingTimer !== undefined) {
      clearTimeout(pendingTimer);
      pendingTimer = undefined;
    }
    for (const h of subscribers) h.onClose?.();
  };

  const drainSync = (): void => {
    while (cursor < events.length) {
      if (state !== 'running') return; // stop() called from a handler
      const ev = events[cursor];
      cursor += 1;
      if (ev !== undefined) emitEvent(ev);
    }
    finish();
  };

  const scheduleNext = (baseReal: number, baseVirtual: number): void => {
    if (state !== 'running') return;
    if (cursor >= events.length) {
      finish();
      return;
    }
    const ev = events[cursor];
    if (ev === undefined) {
      finish();
      return;
    }
    const targetReal = baseReal + (ev.ts - baseVirtual) / replaySpeed;
    const delay = Math.max(0, targetReal - Date.now());
    pendingTimer = setTimeout(() => {
      pendingTimer = undefined;
      if (state !== 'running') return;
      cursor += 1;
      emitEvent(ev);
      scheduleNext(baseReal, baseVirtual);
    }, delay);
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
      if (state !== 'idle') return;
      state = 'running';
      emitOpen();
      if (replaySpeed === Infinity) {
        drainSync();
        return;
      }
      const first = events[0];
      if (first === undefined) {
        finish();
        return;
      }
      scheduleNext(Date.now(), first.ts);
    },

    stop(): void {
      if (state === 'done') return;
      if (state === 'idle') {
        state = 'done';
        return; // never opened → no onClose
      }
      finish();
    },
  };
}

/**
 * Convenience: load corpus file(s) and wrap them in a {@link createReplaySource}.
 *
 * @param paths corpus JSONL file path(s).
 * @param opts  replay speed.
 */
export function createReplaySourceFromFiles(
  paths: string[],
  opts: ReplayOptions = {},
): EventSource {
  return createReplaySource(loadCorpusEvents(paths), opts);
}
