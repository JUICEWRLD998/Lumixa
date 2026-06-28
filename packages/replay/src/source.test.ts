import { describe, it, expect, vi, afterEach } from 'vitest';
import type { MarketEvent } from '@lumixa/core';
import { createReplaySource } from './source.js';

/** Minimal odds events for driving the source (the clock is tested separately). */
function oddsEvents(...specs: Array<{ id: string; ts: number }>): MarketEvent[] {
  const events: MarketEvent[] = specs.map(({ id, ts }) => ({
    kind: 'odds',
    ts,
    fixtureId: 1,
    tick: {
      fixtureId: 1,
      messageId: id,
      ts,
      bookmaker: 'B',
      bookmakerId: 1,
      market: '1X2',
      gameState: 'FirstHalf',
      inRunning: true,
      marketParameters: '0',
      marketPeriod: 'FullTime',
      priceNames: ['Home', 'Draw', 'Away'],
      prices: [1.9, 3.4, 4.1],
      pct: [49.451, 27.634, 22.915],
    },
  }));
  const last = events[events.length - 1];
  if (last !== undefined) events.push({ kind: 'end', ts: last.ts, fixtureId: 1 });
  return events;
}

/** Collect everything a source emits into flat arrays. */
function collect(): {
  events: MarketEvent[];
  opens: number;
  closes: number;
  handlers: {
    onEvent: (e: MarketEvent) => void;
    onOpen: () => void;
    onClose: () => void;
  };
} {
  const state = { events: [] as MarketEvent[], opens: 0, closes: 0 };
  return {
    get events() {
      return state.events;
    },
    get opens() {
      return state.opens;
    },
    get closes() {
      return state.closes;
    },
    handlers: {
      onEvent: (e: MarketEvent) => state.events.push(e),
      onOpen: () => (state.opens += 1),
      onClose: () => (state.closes += 1),
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createReplaySource — Infinity (synchronous, deterministic)', () => {
  it('two replays of the same corpus emit identical event arrays', () => {
    const events = oddsEvents({ id: 'a', ts: 1 }, { id: 'b', ts: 2 }, { id: 'c', ts: 3 });

    const runA = collect();
    const srcA = createReplaySource(events);
    srcA.subscribe(runA.handlers);
    srcA.start();

    const runB = collect();
    const srcB = createReplaySource(events);
    srcB.subscribe(runB.handlers);
    srcB.start();

    expect(runA.events).toEqual(runB.events);
    expect(runA.events.map((e) => e.kind)).toEqual(['odds', 'odds', 'odds', 'end']);
  });

  it('emits onOpen before any event and onClose exactly once at the end', () => {
    const run = collect();
    const src = createReplaySource(oddsEvents({ id: 'a', ts: 1 }));
    src.subscribe(run.handlers);
    src.start();
    expect(run.opens).toBe(1);
    expect(run.closes).toBe(1);
    expect(run.events.at(-1)?.kind).toBe('end');
  });

  it('start() is idempotent (no double emission)', () => {
    const run = collect();
    const src = createReplaySource(oddsEvents({ id: 'a', ts: 1 }));
    src.subscribe(run.handlers);
    src.start();
    src.start();
    expect(run.events.filter((e) => e.kind === 'odds')).toHaveLength(1);
  });

  it('stop() from inside a handler halts further emission', () => {
    const events = oddsEvents({ id: 'a', ts: 1 }, { id: 'b', ts: 2 }, { id: 'c', ts: 3 });
    const seen: string[] = [];
    let closes = 0;
    const src = createReplaySource(events);
    src.subscribe({
      onEvent: (e) => {
        if (e.kind === 'odds') {
          seen.push(e.tick.messageId);
          if (e.tick.messageId === 'a') src.stop();
        }
      },
      onClose: () => (closes += 1),
    });
    src.start();
    expect(seen).toEqual(['a']);
    expect(closes).toBe(1);
  });
});

describe('createReplaySource — finite speed (virtual clock)', () => {
  it('schedules emission in scaled real time', () => {
    vi.useFakeTimers();
    const run = collect();
    // two odds 2000ms apart in virtual time; at 2× that is 1000ms real.
    const src = createReplaySource(oddsEvents({ id: 'a', ts: 1000 }, { id: 'b', ts: 3000 }), {
      replaySpeed: 2,
    });
    src.subscribe(run.handlers);
    src.start();

    vi.advanceTimersByTime(0); // first event (delay 0)
    expect(run.events.map((e) => e.kind)).toEqual(['odds']);

    vi.advanceTimersByTime(999);
    expect(run.events.filter((e) => e.kind === 'odds')).toHaveLength(1); // not yet

    vi.advanceTimersByTime(1); // crosses the 1000ms boundary → 2nd odds + end
    expect(run.events.map((e) => e.kind)).toEqual(['odds', 'odds', 'end']);
    expect(run.closes).toBe(1);
  });

  it('stop() cancels the pending timer and emits a single onClose', () => {
    vi.useFakeTimers();
    const run = collect();
    const src = createReplaySource(oddsEvents({ id: 'a', ts: 1000 }, { id: 'b', ts: 9000 }), {
      replaySpeed: 1,
    });
    src.subscribe(run.handlers);
    src.start();

    vi.advanceTimersByTime(0); // first odds fires
    src.stop();
    vi.advanceTimersByTime(60_000); // nothing more should fire

    expect(run.events.filter((e) => e.kind === 'odds')).toHaveLength(1);
    expect(run.closes).toBe(1);
  });
});

describe('createReplaySource — validation', () => {
  it('rejects a non-positive replaySpeed', () => {
    expect(() => createReplaySource([], { replaySpeed: 0 })).toThrow();
  });
});
