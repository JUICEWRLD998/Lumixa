import { maxLaggedCorr, median, resampleLOCF, type TimedValue } from './stats.js';
import { booksForOutcome, type OutcomeKey } from './consensus.js';
import type { StrategyConfig } from './strategy.js';
import type { Series, SeriesPoint, TimeSeriesStore } from './store.js';

/** The attributed price-discovery leader for an outcome. */
export interface LeaderAttribution {
  /** `BookmakerId` whose moves the rest of the market follows */
  bookmakerId: number;
  /** lagged correlation against the leave-one-out consensus */
  corr: number;
  /** lag (grid steps) by which the consensus trails this book */
  lagSteps: number;
}

const asPct = (points: readonly SeriesPoint[]): TimedValue[] =>
  points.map((p) => ({ ts: p.ts, value: p.pct }));

/**
 * Attribute the PRICE-DISCOVERY LEADER for an outcome over the trailing
 * `leadLagWindowMs`: the book whose series the rest of the market *follows*.
 *
 * Method: resample every book onto a uniform grid, then for each candidate book
 * cross-correlate it against the **leave-one-out** consensus (median of the
 * OTHER books). Leaving the candidate out removes the trivial self-correlation
 * at lag 0, so a genuine leader surfaces as a high correlation at lag ≥ 1 (the
 * consensus reacting later). The book with the strongest such lead — and
 * `corr ≥ minLeaderCorr` — wins; `undefined` if none qualifies or < 2 books.
 */
export function priceDiscoveryLeader(
  store: TimeSeriesStore,
  key: OutcomeKey,
  now: number,
  cfg: StrategyConfig,
): LeaderAttribution | undefined {
  const books = booksForOutcome(store, key);
  if (books.length < 2) return undefined;

  const startTs = now - cfg.leadLagWindowMs;
  const grids = books.map((b) => resampleLOCF(asPct(b.points), startTs, now, cfg.resampleStepMs));
  const gridLen = grids[0]?.length ?? 0;
  if (gridLen < 3) return undefined;

  const maxLagSteps = Math.max(1, Math.floor(cfg.steamWindowMs / cfg.resampleStepMs));
  let best: LeaderAttribution | undefined;

  for (let i = 0; i < books.length; i += 1) {
    const others = grids.filter((_, j) => j !== i);
    const consensus: number[] = [];
    for (let g = 0; g < gridLen; g += 1) {
      consensus.push(median(others.map((o) => o[g] as number)));
    }
    const { lag, corr } = maxLaggedCorr(grids[i] as number[], consensus, maxLagSteps);
    if (lag >= 1 && corr >= cfg.minLeaderCorr && (best === undefined || corr > best.corr)) {
      best = { bookmakerId: (books[i] as Series).bookmakerId, corr, lagSteps: lag };
    }
  }
  return best;
}
