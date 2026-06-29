/**
 * @lumixa/trader — the ACT layer.
 *
 * An autonomous, risk-limited paper position manager that turns engine
 * {@link Signal}s into {@link Decision} ledger rows and settles them against the
 * closing line. Deterministic, so replay reproduces the same ledger.
 */
export * from './trader.js';
