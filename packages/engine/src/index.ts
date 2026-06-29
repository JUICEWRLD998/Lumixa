/**
 * @lumixa/engine — the SENSE layer.
 *
 * Phase 1 shipped the substrate: an in-memory per-bookmaker {@link TimeSeriesStore}
 * fed from any `EventSource` (live or replay) via `attach`. Phase 2 adds the
 * detection stack that reads it:
 *  - stats:     `mean`/`median`/`pearson` + resample & lagged-correlation
 *  - strategy:  `StrategyConfig` (`θ`, `w`, lead-lag window, risk limits)
 *  - consensus: median-across-books fair line
 *  - steam:     per-book steam-move detector
 *  - leadlag:   price-discovery leader attribution
 *  - signal:    `SignalEngine` tying it together into provenance-rich `Signal`s
 *  - grade:     CLV / Brier math (reused by the Phase-3 prover)
 */
export * from './store.js';
export * from './stats.js';
export * from './strategy.js';
export * from './consensus.js';
export * from './steam.js';
export * from './leadlag.js';
export * from './signal.js';
export * from './grade.js';
