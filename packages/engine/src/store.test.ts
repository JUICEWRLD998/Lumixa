import { describe, it, expect } from 'vitest';
import type { EventHandlers, EventSource, MarketEvent, OddsTick } from '@lumixa/core';
import { TimeSeriesStore, seriesKey } from './store.js';

function tick(overrides: Partial<OddsTick> & { ts: number }): OddsTick {
  return {
    fixtureId: 1,
    messageId: `m-${overrides.ts}`,
    bookmaker: 'BookA',
    bookmakerId: 7,
    market: '1X2',
    gameState: 'FirstHalf',
    inRunning: true,
    marketParameters: '0',
    marketPeriod: 'FullTime',
    priceNames: ['Home', 'Draw', 'Away'],
    prices: [1.9, 3.4, 4.1],
    pct: [49.451, 27.634, 22.915],
    ...overrides,
  };
}

const oddsEvent = (t: OddsTick): MarketEvent => ({
  kind: 'odds',
  ts: t.ts,
  fixtureId: t.fixtureId,
  tick: t,
});

/** A trivial EventSource that emits a fixed list on `start()`. */
function fixedSource(events: MarketEvent[]): EventSource {
  let handlers: EventHandlers | undefined;
  return {
    subscribe(h) {
      handlers = h;
      return { close: () => (handlers = undefined) };
    },
    start() {
      for (const e of events) handlers?.onEvent(e);
    },
    stop() {},
  };
}

describe('TimeSeriesStore.ingest', () => {
  it('splits an odds tick into one series per outcome', () => {
    const store = new TimeSeriesStore();
    store.ingest(oddsEvent(tick({ ts: 1000 })));
    expect(store.keys()).toHaveLength(3); // Home / Draw / Away
    const homeKey = seriesKey({ fixtureId: 1, market: '1X2', outcome: 'Home', bookmakerId: 7 });
    expect(store.series(homeKey)).toEqual([{ ts: 1000, pct: 49.451, price: 1.9 }]);
  });

  it('appends samples over time and reports the latest', () => {
    const store = new TimeSeriesStore();
    store.ingest(oddsEvent(tick({ ts: 1000, pct: [50, 28, 22] })));
    store.ingest(oddsEvent(tick({ ts: 2000, pct: [55, 25, 20] })));
    const homeKey = seriesKey({ fixtureId: 1, market: '1X2', outcome: 'Home', bookmakerId: 7 });
    expect(store.series(homeKey)).toHaveLength(2);
    expect(store.latest(homeKey)?.pct).toBe(55);
  });

  it('separates series by bookmaker', () => {
    const store = new TimeSeriesStore();
    store.ingest(oddsEvent(tick({ ts: 1000, bookmakerId: 7 })));
    store.ingest(oddsEvent(tick({ ts: 1000, bookmakerId: 9 })));
    expect(store.keys()).toHaveLength(6); // 3 outcomes × 2 books
  });

  it('ignores non-odds events', () => {
    const store = new TimeSeriesStore();
    store.ingest({ kind: 'start', ts: 1, fixtureId: 1 });
    store.ingest({ kind: 'end', ts: 9, fixtureId: 1 });
    expect(store.keys()).toHaveLength(0);
  });

  it('returns [] / undefined for unknown keys', () => {
    const store = new TimeSeriesStore();
    expect(store.series('nope')).toEqual([]);
    expect(store.latest('nope')).toBeUndefined();
  });
});

describe('TimeSeriesStore.attach', () => {
  it('is fed by any EventSource (unified live/replay interface)', () => {
    const store = new TimeSeriesStore();
    const source = fixedSource([
      oddsEvent(tick({ ts: 1000 })),
      oddsEvent(tick({ ts: 2000 })),
    ]);
    store.attach(source);
    source.start();
    const homeKey = seriesKey({ fixtureId: 1, market: '1X2', outcome: 'Home', bookmakerId: 7 });
    expect(store.series(homeKey)).toHaveLength(2);
  });

  it('stops receiving after the subscription is closed', () => {
    const store = new TimeSeriesStore();
    const source = fixedSource([oddsEvent(tick({ ts: 1000 }))]);
    const sub = store.attach(source);
    sub.close();
    source.start();
    expect(store.keys()).toHaveLength(0);
  });
});
