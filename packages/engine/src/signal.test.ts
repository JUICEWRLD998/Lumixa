import { describe, it, expect } from 'vitest';
import type { MarketEvent } from '@lumixa/core';
import { SignalEngine, type Signal } from './signal.js';
import { DEFAULT_STRATEGY } from './strategy.js';

const STEP = DEFAULT_STRATEGY.resampleStepMs; // 5_000

/** Build a 1X2 odds event for `book` at `ts` with a given Home `pct`. */
function oddsEvent(book: number, ts: number, homePct: number): MarketEvent {
  const rest = (100 - homePct) / 2;
  const pct = [homePct, rest, rest];
  return {
    kind: 'odds',
    ts,
    fixtureId: 1,
    tick: {
      fixtureId: 1,
      messageId: `m-${book}-${ts}`,
      ts,
      bookmaker: `B${book}`,
      bookmakerId: book,
      market: '1X2',
      gameState: 'FirstHalf',
      inRunning: true,
      marketParameters: '0',
      marketPeriod: 'FullTime',
      priceNames: ['Home', 'Draw', 'Away'],
      prices: pct.map((p) => 100 / p),
      pct,
    },
  };
}

/** Feed events to an engine in timestamp order (stable), collecting signals. */
function run(events: MarketEvent[]): Signal[] {
  const engine = new SignalEngine(DEFAULT_STRATEGY);
  const signals: Signal[] = [];
  engine.onSignal((s) => signals.push(s));
  const ordered = events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.ts - b.e.ts || a.i - b.i)
    .map(({ e }) => e);
  for (const e of ordered) engine.ingest(e);
  return signals;
}

describe('SignalEngine', () => {
  it('fires when steam originates at the leader while the consensus lags', () => {
    const LEADER = 9;
    // Leader path: a non-monotonic wiggle (breaks lead-lag degeneracy) ending in
    // a sharp Home ramp (the steam). Followers replay it 2 steps later.
    const L: number[] = [];
    for (let k = 0; k <= 60; k += 1) {
      let v = 50 + 2 * Math.sin(k * 0.9);
      if (k > 50) v += (k - 50) * 1.2; // steam ramp on the tail
      L[k] = v;
    }

    const events: MarketEvent[] = [];
    for (let k = 0; k <= 60; k += 1) {
      events.push(oddsEvent(LEADER, k * STEP, L[k] as number));
      events.push(oddsEvent(1, k * STEP + 2 * STEP, L[k] as number));
      events.push(oddsEvent(2, k * STEP + 2 * STEP, L[k] as number));
    }

    const signals = run(events);

    // At least one Home signal attributed to the leader, consensus still lagging.
    const home = signals.filter((s) => s.outcome === 'Home' && s.leaderBook === LEADER);
    expect(home.length).toBeGreaterThan(0);
    const sig = home[home.length - 1] as Signal;
    expect(sig.leaderPct).toBeGreaterThan(sig.consensusPct);
    expect(sig.leadLag.lagSteps).toBeGreaterThanOrEqual(1);

    // Invariants that must hold for EVERY fired signal.
    for (const s of signals) {
      expect(s.steam.direction).toBe(1);
      expect(s.entryPrice).toBeCloseTo(100 / s.consensusPct, 10);
      expect(s.leaderPct - s.consensusPct).toBeGreaterThanOrEqual(DEFAULT_STRATEGY.minLeadGapPct);
    }
  });

  it('does not fire on a synchronized market move (steam but no leader)', () => {
    // All books jump together at the same instants → no book leads → no signal,
    // even though the jump is a textbook steam move.
    const events: MarketEvent[] = [];
    for (let k = 0; k <= 60; k += 1) {
      const v = k < 30 ? 50 : 56; // synchronized step up at k=30
      for (const book of [9, 1, 2]) events.push(oddsEvent(book, k * STEP, v));
    }
    expect(run(events)).toHaveLength(0);
  });
});
