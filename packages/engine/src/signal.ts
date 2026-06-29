import type { EventSource, MarketEvent, Subscription } from '@lumixa/core';
import { TimeSeriesStore } from './store.js';
import { booksForOutcome, consensusLatest, type OutcomeKey } from './consensus.js';
import { detectSteam, type SteamMove } from './steam.js';
import { priceDiscoveryLeader } from './leadlag.js';
import { DEFAULT_STRATEGY, type StrategyConfig } from './strategy.js';

/**
 * A fired trading signal with full provenance — everything needed to act on it
 * AND to later explain/audit why it fired. Emitted when a steam move originates
 * at the price-discovery leader while the consensus still lags.
 */
export interface Signal {
  fixtureId: number;
  market: string;
  /** the outcome to back — the side the leader is moving toward */
  outcome: string;
  /** `BookmakerId` of the leader that triggered the move */
  leaderBook: number;
  /** leader's demargined `Pct` now */
  leaderPct: number;
  /** consensus (median) demargined `Pct` now — still lagging the leader */
  consensusPct: number;
  /** fair decimal odds at the consensus price (`100 / consensusPct`) */
  entryPrice: number;
  /** lagged correlation evidence for the leadership claim */
  leadLag: { corr: number; lagSteps: number };
  /** the steam move itself */
  steam: SteamMove;
  /** `MessageId` of the odds tick that triggered the signal (anchored later) */
  messageId: string;
  ts: number;
}

/** A subscriber to fired {@link Signal}s. */
export type SignalHandler = (sig: Signal) => void;

/**
 * The SENSE engine: folds an {@link EventSource} into a per-book
 * {@link TimeSeriesStore} and, on every odds tick, evaluates the steam →
 * leader → lagging-consensus chain, emitting a {@link Signal} when it completes.
 *
 * Source-agnostic by construction — `attach` accepts the live feed or the
 * replay source identically, so the backtest and the live agent run the SAME
 * detection code.
 */
export class SignalEngine {
  readonly store = new TimeSeriesStore();
  private readonly cfg: StrategyConfig;
  private readonly handlers = new Set<SignalHandler>();

  constructor(cfg: StrategyConfig = DEFAULT_STRATEGY) {
    this.cfg = cfg;
  }

  /** Register a signal handler; returns an unsubscribe fn. */
  onSignal(handler: SignalHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /** Subscribe to a source so every event is folded in + evaluated. */
  attach(source: EventSource): Subscription {
    return source.subscribe({ onEvent: (ev) => this.ingest(ev) });
  }

  /** Fold one event into the store, then evaluate the tick's outcomes. */
  ingest(ev: MarketEvent): void {
    this.store.ingest(ev);
    if (ev.kind !== 'odds') return;
    const { tick } = ev;
    for (const outcome of tick.priceNames) {
      this.evaluate(
        { fixtureId: tick.fixtureId, market: tick.market, outcome },
        tick.bookmakerId,
        tick.messageId,
        ev.ts,
      );
    }
  }

  private emit(sig: Signal): void {
    for (const h of this.handlers) h(sig);
  }

  /**
   * Evaluate one `(outcome)` line for the book that just ticked. Fires only when
   * that book is steaming UP on this outcome (backing the side it moves toward),
   * IS the attributed leader, and the consensus still trails it by `minLeadGap`.
   */
  private evaluate(key: OutcomeKey, tickBook: number, messageId: string, now: number): void {
    const series = booksForOutcome(this.store, key).find((s) => s.bookmakerId === tickBook);
    if (series === undefined) return;

    const steam = detectSteam(series, now, this.cfg);
    // Back the side the leader moves TOWARD: only a shortening (direction +1)
    // move on THIS outcome is an entry. The opposite leg fires on its own line.
    if (steam === undefined || steam.direction !== 1) return;

    const leader = priceDiscoveryLeader(this.store, key, now, this.cfg);
    if (leader === undefined || leader.bookmakerId !== tickBook) return;

    const consensusPct = consensusLatest(this.store, key, now);
    if (consensusPct === undefined || consensusPct <= 0) return;

    // "consensus has not yet repriced": leader still leads it by ≥ minLeadGapPct.
    if (steam.toPct - consensusPct < this.cfg.minLeadGapPct) return;

    this.emit({
      fixtureId: key.fixtureId,
      market: key.market,
      outcome: key.outcome,
      leaderBook: tickBook,
      leaderPct: steam.toPct,
      consensusPct,
      entryPrice: 100 / consensusPct,
      leadLag: { corr: leader.corr, lagSteps: leader.lagSteps },
      steam,
      messageId,
      ts: now,
    });
  }
}
