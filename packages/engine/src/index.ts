/**
 * @lumixa/engine — the SENSE layer.
 *
 * Phase 1 ships the substrate: an in-memory per-bookmaker {@link TimeSeriesStore}
 * fed from any `EventSource` (live or replay) via `attach`. Phase 2 adds the
 * steam detector and lead-lag / price-discovery attribution that read it.
 */
export * from './store.js';
