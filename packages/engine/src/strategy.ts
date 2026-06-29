import { z } from 'zod';

/**
 * Tunable strategy parameters for the SENSE → ACT pipeline (implementation.md
 * §9). Defaults are the documented starting points; a deployment overrides them
 * via `config/strategy.json` (see {@link loadStrategy}). All windows are in ms,
 * all `Pct` thresholds in percentage points (the units of demargined `Pct`).
 */
export const StrategySchema = z.object({
  /** `θ` — min demargined-`Pct` shift (pp) within the window to flag steam */
  steamThreshold: z.number().positive().default(1.5),
  /** `w` — window over which the steam shift is measured */
  steamWindowMs: z.number().int().positive().default(120_000),
  /** cross-correlation lookback for lead-lag attribution */
  leadLagWindowMs: z.number().int().positive().default(300_000),
  /** uniform grid step the per-book + consensus series are resampled onto */
  resampleStepMs: z.number().int().positive().default(5_000),
  /** min lagged correlation to name a book the price-discovery leader */
  minLeaderCorr: z.number().min(0).max(1).default(0.6),
  /**
   * "consensus has not yet repriced" gate: the leader must still lead the
   * consensus by at least this many pp for the signal to fire (else the edge is
   * already gone). Defaults to half `θ`.
   */
  minLeadGapPct: z.number().min(0).default(0.75),
  /** stake per admitted decision (paper/devnet book units) */
  maxStake: z.number().positive().default(100),
  /** max simultaneously-open positions */
  maxConcurrent: z.number().int().positive().default(5),
  /** per-`(fixture, market)` exposure cap (sum of open stakes) */
  maxMarketExposure: z.number().positive().default(250),
});

/** Resolved strategy configuration. */
export type StrategyConfig = z.infer<typeof StrategySchema>;

/** Validate a raw config object (e.g. parsed JSON) into a {@link StrategyConfig}. */
export function parseStrategy(raw: unknown = {}): StrategyConfig {
  return StrategySchema.parse(raw);
}

/** The all-defaults strategy — used by tests and as the backtest fallback. */
export const DEFAULT_STRATEGY: StrategyConfig = parseStrategy({});
