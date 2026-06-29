import type { EventSource, MarketEvent, Subscription } from '@lumixa/core';

/** One sample in a per-(book, outcome) demargined-probability time series. */
export interface SeriesPoint {
  /** event timestamp (ms) */
  ts: number;
  /** demargined implied probability, percent */
  pct: number;
  /** decimal odds at this instant */
  price: number;
}

/** The four coordinates that identify a single time series. */
export interface SeriesKeyParts {
  fixtureId: number;
  /** market type, e.g. `"1X2"` */
  market: string;
  /** outcome label, e.g. `"Home"` */
  outcome: string;
  bookmakerId: number;
}

/** One named series: its coordinates plus the ordered samples. */
export interface Series extends SeriesKeyParts {
  points: SeriesPoint[];
}

/** Build the canonical string key for a series. */
export function seriesKey(parts: SeriesKeyParts): string {
  return `${parts.fixtureId}|${parts.market}|${parts.outcome}|${parts.bookmakerId}`;
}

/**
 * In-memory per-bookmaker time-series store.
 *
 * Maintains, for every `(fixtureId, market, outcome, bookmakerId)`, the ordered
 * series of demargined `Pct` (and price) over time. This is the substrate the
 * Phase-2 SENSE engine reads to detect steam moves and attribute price-discovery
 * leadership across books.
 *
 * It is deliberately source-agnostic: {@link attach} feeds it from ANY
 * {@link EventSource}, so the live feed and the replay engine populate it
 * identically — the concrete payoff of the unified event interface.
 */
export class TimeSeriesStore {
  private readonly byKey = new Map<string, Series>();

  /**
   * Fold one event into the store. Only `odds` events carry per-book quotes;
   * other kinds (`score`/`start`/`end`) are ignored here.
   */
  ingest(ev: MarketEvent): void {
    if (ev.kind !== 'odds') return;
    const { tick } = ev;
    const n = Math.min(tick.priceNames.length, tick.prices.length, tick.pct.length);
    for (let i = 0; i < n; i += 1) {
      const outcome = tick.priceNames[i];
      const price = tick.prices[i];
      const pct = tick.pct[i];
      if (outcome === undefined || price === undefined || pct === undefined) continue;
      const parts: SeriesKeyParts = {
        fixtureId: tick.fixtureId,
        market: tick.market,
        outcome,
        bookmakerId: tick.bookmakerId,
      };
      const key = seriesKey(parts);
      let s = this.byKey.get(key);
      if (s === undefined) {
        s = { ...parts, points: [] };
        this.byKey.set(key, s);
      }
      s.points.push({ ts: ev.ts, pct, price });
    }
  }

  /** Subscribe to a source so every event is folded in via {@link ingest}. */
  attach(source: EventSource): Subscription {
    return source.subscribe({ onEvent: (ev) => this.ingest(ev) });
  }

  /** The full sample series for a key, or `[]` if unknown. */
  series(key: string): readonly SeriesPoint[] {
    return this.byKey.get(key)?.points ?? [];
  }

  /** The most recent sample for a key, or `undefined` if none. */
  latest(key: string): SeriesPoint | undefined {
    const points = this.byKey.get(key)?.points;
    return points === undefined ? undefined : points[points.length - 1];
  }

  /** All known series keys. */
  keys(): string[] {
    return [...this.byKey.keys()];
  }

  /** All series with their coordinates (for iteration / the engine). */
  all(): Series[] {
    return [...this.byKey.values()];
  }
}
