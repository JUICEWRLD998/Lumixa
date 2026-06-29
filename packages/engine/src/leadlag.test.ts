import { describe, it, expect } from 'vitest';
import type { MarketEvent } from '@lumixa/core';
import { TimeSeriesStore } from './store.js';
import { priceDiscoveryLeader } from './leadlag.js';
import { DEFAULT_STRATEGY } from './strategy.js';
import type { OutcomeKey } from './consensus.js';

const KEY: OutcomeKey = { fixtureId: 1, market: '1X2', outcome: 'Home' };
const STEP = DEFAULT_STRATEGY.resampleStepMs; // 5_000
const NOW = 300_000; // == leadLagWindowMs, so the grid is [0, NOW]

/** A non-monotonic triangle 50→60→50 — a distinctive shape so cross-correlation peaks. */
function wave(k: number): number {
  const kk = Math.max(0, Math.min(40, k));
  const tri = kk <= 20 ? kk : 40 - kk; // 0..20..0
  return 50 + tri * 0.5; // 50..60..50
}

function ingestHome(store: TimeSeriesStore, bookId: number, ts: number, homePct: number): void {
  const rest = (100 - homePct) / 2;
  const pct = [homePct, rest, rest];
  const ev: MarketEvent = {
    kind: 'odds',
    ts,
    fixtureId: 1,
    tick: {
      fixtureId: 1,
      messageId: `m-${bookId}-${ts}`,
      ts,
      bookmaker: `B${bookId}`,
      bookmakerId: bookId,
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
  store.ingest(ev);
}

describe('priceDiscoveryLeader', () => {
  it('names the book the rest of the market follows (with the true lag)', () => {
    const store = new TimeSeriesStore();
    const LEADER = 9;
    const DELAY = 2 * STEP; // followers trail the leader by 2 grid steps
    for (let k = 0; k <= 60; k += 1) {
      const v = wave(k);
      ingestHome(store, LEADER, k * STEP, v); // leader moves at grid time
      ingestHome(store, 1, k * STEP + DELAY, v); // followers replay it `DELAY` later
      ingestHome(store, 2, k * STEP + DELAY, v);
    }

    const leader = priceDiscoveryLeader(store, KEY, NOW, DEFAULT_STRATEGY);
    expect(leader?.bookmakerId).toBe(LEADER);
    expect(leader?.lagSteps).toBe(2);
    expect(leader?.corr).toBeGreaterThanOrEqual(DEFAULT_STRATEGY.minLeaderCorr);
  });

  it('returns undefined with fewer than two books', () => {
    const store = new TimeSeriesStore();
    for (let k = 0; k <= 60; k += 1) ingestHome(store, 9, k * STEP, wave(k));
    expect(priceDiscoveryLeader(store, KEY, NOW, DEFAULT_STRATEGY)).toBeUndefined();
  });
});
