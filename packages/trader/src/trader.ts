import type { Decision } from '@lumixa/core';
import { clv as computeClv, DEFAULT_STRATEGY, type Signal, type StrategyConfig } from '@lumixa/engine';

/** Resolve the closing consensus `Pct` for a settled decision's backed side. */
export type ClosingResolver = (decision: Decision) => number | undefined;

const positionKey = (fixtureId: number, market: string, outcome: string): string =>
  `${fixtureId}|${market}|${outcome}`;
const marketKey = (fixtureId: number, market: string): string => `${fixtureId}|${market}`;

/**
 * The ACT layer: an autonomous, risk-limited paper position manager. Consumes
 * {@link Signal}s from the engine and turns admitted ones into {@link Decision}
 * ledger rows; settles them against the closing line at end-of-match.
 *
 * Deterministic by construction (stable decision ids, no wall-clock/RNG) so a
 * replay of the same corpus produces an identical decision ledger.
 */
export class Trader {
  private readonly cfg: StrategyConfig;
  /** currently-open positions, keyed `fixture|market|outcome` */
  private readonly open = new Map<string, Decision>();
  /** every decision ever opened, in order (the ledger) */
  private readonly ledger: Decision[] = [];

  constructor(cfg: StrategyConfig = DEFAULT_STRATEGY) {
    this.cfg = cfg;
  }

  /**
   * Consider a signal. Returns the opened {@link Decision}, or `undefined` if a
   * risk limit or the dedupe guard rejected it:
   *  - already holding this `(fixture, market, outcome)` (no double-entry);
   *  - `maxConcurrent` open positions reached;
   *  - opening would breach the per-`(fixture, market)` `maxMarketExposure`.
   */
  onSignal(sig: Signal): Decision | undefined {
    const key = positionKey(sig.fixtureId, sig.market, sig.outcome);
    if (this.open.has(key)) return undefined;
    if (this.open.size >= this.cfg.maxConcurrent) return undefined;

    const mKey = marketKey(sig.fixtureId, sig.market);
    const exposure = [...this.open.values()]
      .filter((d) => marketKey(d.fixtureId, d.market) === mKey)
      .reduce((sum, d) => sum + d.stake, 0);
    const stake = this.cfg.maxStake;
    if (exposure + stake > this.cfg.maxMarketExposure) return undefined;

    const decision: Decision = {
      id: `dec-${sig.messageId}-${sig.outcome}`,
      messageId: sig.messageId,
      fixtureId: sig.fixtureId,
      market: sig.market,
      side: sig.outcome,
      price: sig.entryPrice,
      entryPct: sig.consensusPct,
      ourTs: sig.ts,
      leaderBook: sig.leaderBook,
      stake,
      status: 'open',
    };
    this.open.set(key, decision);
    this.ledger.push(decision);
    return decision;
  }

  /**
   * Settle every open position against the closing line: set `closingPct` +
   * `clv` and mark `settled`. Positions the resolver can't price are left open
   * (and so excluded from CLV reporting). Terminal — clears open positions.
   */
  settle(closing: ClosingResolver): void {
    for (const decision of this.open.values()) {
      const closingPct = closing(decision);
      if (closingPct === undefined) continue;
      decision.closingPct = closingPct;
      decision.clv = computeClv(decision.entryPct, closingPct);
      decision.status = 'settled';
    }
    this.open.clear();
  }

  /** The full decision ledger, in order opened. */
  decisions(): readonly Decision[] {
    return this.ledger;
  }

  /** Count of currently-open positions (for risk introspection / tests). */
  openCount(): number {
    return this.open.size;
  }
}
