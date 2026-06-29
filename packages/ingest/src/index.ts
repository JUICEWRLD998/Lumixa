/**
 * @lumixa/ingest — the TxLINE API client.
 *
 * Public surface:
 *  - {@link TxlineClient} + factories — authenticated REST access to odds
 *    snapshots/intervals, scores, Merkle proofs, stat-validation, fixtures.
 *  - SSE subscribers ({@link subscribeOdds} / {@link subscribeScores}) with
 *    backoff reconnect — the live capture path for the replay corpus.
 *  - {@link createLiveSource} — the SSE feed as an `EventSource`, with backfill
 *    on (re)connect, so engine/trader code is identical live vs. replay.
 *  - auth flows ({@link guestStart} / {@link activateToken}).
 *  - endpoint URL builders + the low-level {@link requestJson} HTTP wrapper.
 *
 * Several endpoint paths are not yet confirmed against the live API — see
 * `endpoints.ts` for the full list of `TODO(confirm)` markers.
 */
export * from './endpoints.js';
export * from './http.js';
export * from './auth.js';
export * from './client.js';
export * from './sse.js';
export * from './factory.js';
export * from './live-source.js';
export * from './logger.js';
