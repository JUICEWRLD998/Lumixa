import type { StrategyConfig } from './strategy.js';
import type { Series, SeriesPoint } from './store.js';

/** A detected steam move on one book's outcome line. */
export interface SteamMove {
  bookmakerId: number;
  market: string;
  outcome: string;
  /** demargined `Pct` at the window start (LOCF) */
  fromPct: number;
  /** demargined `Pct` now */
  toPct: number;
  /** `toPct − fromPct` (pp) — signed */
  delta: number;
  /** `+1` shortening (prob rising), `-1` drifting (prob falling) */
  direction: 1 | -1;
  windowStartTs: number;
  ts: number;
}

/** LOCF lookup: latest `pct` at-or-before `t`, backfilling the earliest sample. */
function pctAtOrBefore(points: readonly SeriesPoint[], t: number): number | undefined {
  const first = points[0];
  if (first === undefined) return undefined;
  let last = first.pct; // backfill earliest until the first sample's ts
  for (const p of points) {
    if (p.ts <= t) last = p.pct;
    else break;
  }
  return last;
}

/**
 * Detect a steam move on a single book's outcome series as of `now`: the `Pct`
 * shifted more than `θ` (`steamThreshold`) over the trailing `w`
 * (`steamWindowMs`) window. Returns the move (with provenance) or `undefined`.
 *
 * Points are assumed ascending in `ts` (as the {@link TimeSeriesStore} maintains
 * them). The baseline backfills the earliest quote, so a sharp move right after
 * a book's first quote still registers.
 */
export function detectSteam(
  series: Series,
  now: number,
  cfg: StrategyConfig,
): SteamMove | undefined {
  const windowStartTs = now - cfg.steamWindowMs;
  const toPct = pctAtOrBefore(series.points, now);
  const fromPct = pctAtOrBefore(series.points, windowStartTs);
  if (toPct === undefined || fromPct === undefined) return undefined;

  const delta = toPct - fromPct;
  if (Math.abs(delta) <= cfg.steamThreshold) return undefined;

  return {
    bookmakerId: series.bookmakerId,
    market: series.market,
    outcome: series.outcome,
    fromPct,
    toPct,
    delta,
    direction: delta > 0 ? 1 : -1,
    windowStartTs,
    ts: now,
  };
}
