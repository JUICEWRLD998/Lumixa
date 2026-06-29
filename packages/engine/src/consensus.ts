import { median, resampleLOCF, type TimedValue } from './stats.js';
import type { Series, SeriesPoint, TimeSeriesStore } from './store.js';

/** A uniform resample grid `[startTs, endTs]` stepping by `stepMs`. */
export interface Grid {
  startTs: number;
  endTs: number;
  stepMs: number;
}

/** Coordinates of a single outcome line (a series minus the bookmaker). */
export interface OutcomeKey {
  fixtureId: number;
  market: string;
  outcome: string;
}

/** All per-book series for one outcome (every bookmaker quoting it). */
export function booksForOutcome(store: TimeSeriesStore, key: OutcomeKey): Series[] {
  return store
    .all()
    .filter(
      (s) =>
        s.fixtureId === key.fixtureId && s.market === key.market && s.outcome === key.outcome,
    );
}

/** A series' `pct` samples as {@link TimedValue}s for resampling. */
const asPct = (points: readonly SeriesPoint[]): TimedValue[] =>
  points.map((p) => ({ ts: p.ts, value: p.pct }));

/**
 * The CONSENSUS fair line for an outcome over a grid: at every grid point, the
 * MEDIAN of the books' demargined `Pct` (each book resampled LOCF onto the same
 * grid). Median (not mean) so a single steaming book can't drag the consensus —
 * the property the "consensus lags the leader" thesis relies on.
 */
export function consensusSeries(store: TimeSeriesStore, key: OutcomeKey, grid: Grid): number[] {
  const books = booksForOutcome(store, key);
  if (books.length === 0) return [];
  const resampled = books.map((b) => resampleLOCF(asPct(b.points), grid.startTs, grid.endTs, grid.stepMs));
  const gridLen = resampled[0]?.length ?? 0;
  const out: number[] = [];
  for (let i = 0; i < gridLen; i += 1) {
    out.push(median(resampled.map((r) => r[i] as number)));
  }
  return out;
}

/** Each book's latest `pct` at-or-before `atTs` (LOCF at a single instant). */
export function latestPctByBook(
  store: TimeSeriesStore,
  key: OutcomeKey,
  atTs: number,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const book of booksForOutcome(store, key)) {
    let last: number | undefined;
    for (const p of book.points) {
      if (p.ts <= atTs) last = p.pct;
      else break;
    }
    if (last !== undefined) out.set(book.bookmakerId, last);
  }
  return out;
}

/**
 * The consensus fair `Pct` at an instant — the median across books of their
 * latest quote at-or-before `atTs`. `undefined` when no book has quoted yet.
 */
export function consensusLatest(
  store: TimeSeriesStore,
  key: OutcomeKey,
  atTs: number,
): number | undefined {
  const byBook = [...latestPctByBook(store, key, atTs).values()];
  return byBook.length === 0 ? undefined : median(byBook);
}
