import { describe, it, expect } from 'vitest';
import type { MarketEvent } from '@lumixa/core';
import { TimeSeriesStore } from './store.js';
import { consensusLatest, consensusSeries, latestPctByBook, type OutcomeKey } from './consensus.js';

const KEY: OutcomeKey = { fixtureId: 1, market: '1X2', outcome: 'Home' };

/** Ingest a 1X2 odds tick with a given Home `pct` (Draw/Away split the rest). */
function ingest(store: TimeSeriesStore, bookId: number, ts: number, homePct: number): void {
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

describe('consensusLatest', () => {
  it('is the median across books of their latest quote', () => {
    const store = new TimeSeriesStore();
    ingest(store, 1, 100, 50);
    ingest(store, 2, 100, 52);
    ingest(store, 3, 100, 54);
    expect(consensusLatest(store, KEY, 100)).toBe(52);
  });

  it('honors LOCF — a later quote only counts once its ts has passed', () => {
    const store = new TimeSeriesStore();
    ingest(store, 1, 100, 50);
    ingest(store, 2, 100, 52);
    ingest(store, 3, 100, 54);
    ingest(store, 1, 200, 60); // book 1 steams to 60 at t=200

    expect(consensusLatest(store, KEY, 150)).toBe(52); // still sees book1=50
    expect(consensusLatest(store, KEY, 250)).toBe(54); // now median(60,52,54)
  });

  it('returns undefined when no book has quoted', () => {
    expect(consensusLatest(new TimeSeriesStore(), KEY, 100)).toBeUndefined();
  });
});

describe('latestPctByBook / consensusSeries', () => {
  it('maps each book to its latest pct', () => {
    const store = new TimeSeriesStore();
    ingest(store, 1, 100, 50);
    ingest(store, 2, 100, 52);
    const byBook = latestPctByBook(store, KEY, 100);
    expect(byBook.get(1)).toBe(50);
    expect(byBook.get(2)).toBe(52);
  });

  it('returns the per-grid-point median across books', () => {
    const store = new TimeSeriesStore();
    ingest(store, 1, 100, 50);
    ingest(store, 2, 100, 52);
    ingest(store, 3, 100, 54);
    ingest(store, 1, 200, 60);
    expect(consensusSeries(store, KEY, { startTs: 100, endTs: 200, stepMs: 100 })).toEqual([52, 54]);
  });
});
