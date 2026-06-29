import type { Decision, MarketEvent } from '@lumixa/core';
import {
  consensusLatest,
  latestPctByBook,
  DEFAULT_STRATEGY,
  SignalEngine,
  type OutcomeKey,
  type Signal,
  type StrategyConfig,
} from '@lumixa/engine';
import { Trader } from '@lumixa/trader';
import { createReplaySource, loadCorpusEvents } from '@lumixa/replay';
import type { LedgerRepository, Prover } from '@lumixa/prover';

/** A compact snapshot of the agent's live state for the `/state` endpoint. */
export interface AgentState {
  /** every decision opened this run, with grading once settled */
  decisions: Decision[];
  /** currently-open position count */
  openCount: number;
  /** the most recent fired signals (newest last), capped */
  recentSignals: Signal[];
  /** per-book demargined `Pct` for the last signal's outcome — the topology snapshot */
  consensus?: {
    key: OutcomeKey;
    consensusPct?: number;
    byBook: { bookmakerId: number; pct: number }[];
  };
}

/** Result of a completed replay run. */
export interface ReplayResult {
  events: number;
  decisions: number;
  settled: number;
}

export interface AgentOptions {
  prover: Prover;
  ledger: LedgerRepository;
  cfg?: StrategyConfig;
  /** max recent signals retained for `/state` (default 20) */
  recentLimit?: number;
}

/**
 * The autonomous loop, wired exactly as `scripts/backtest.ts` proves out:
 * `SignalEngine` (SENSE) → `Trader` (ACT) → `Prover` (PROVE). Driving it from a
 * replay source means the server runs the SAME detection + grading code as the
 * offline backtest — no demo-only path.
 */
export class Agent {
  private readonly cfg: StrategyConfig;
  private readonly prover: Prover;
  private readonly ledger: LedgerRepository;
  private readonly recentLimit: number;

  private engine = new SignalEngine();
  private trader = new Trader();
  private recentSignals: Signal[] = [];
  private lastSignalKey?: OutcomeKey;
  private lastTs = 0;

  constructor(opts: AgentOptions) {
    this.cfg = opts.cfg ?? DEFAULT_STRATEGY;
    this.prover = opts.prover;
    this.ledger = opts.ledger;
    this.recentLimit = opts.recentLimit ?? 20;
  }

  /**
   * Replay corpus file(s) through the full loop: detect signals, open/settle
   * positions, then anchor each decision into the ledger via the prover.
   *
   * @param paths corpus JSONL path(s)
   * @param speed virtual-clock multiplier (default `Infinity` = instant drain)
   */
  async runReplay(paths: string[], speed: number = Infinity): Promise<ReplayResult> {
    // Fresh engine/trader per run so repeated calls don't accumulate state.
    this.engine = new SignalEngine(this.cfg);
    this.trader = new Trader(this.cfg);
    this.recentSignals = [];
    this.lastSignalKey = undefined;

    this.engine.onSignal((sig) => {
      this.trader.onSignal(sig);
      this.lastSignalKey = { fixtureId: sig.fixtureId, market: sig.market, outcome: sig.outcome };
      this.recentSignals.push(sig);
      if (this.recentSignals.length > this.recentLimit) this.recentSignals.shift();
    });

    const events: MarketEvent[] = loadCorpusEvents(paths);
    const endTs = events[events.length - 1]?.ts ?? 0;
    this.lastTs = endTs;

    const source = createReplaySource(events, { replaySpeed: speed });
    this.engine.attach(source);
    const done = new Promise<void>((resolve) => {
      source.subscribe({ onEvent: () => undefined, onClose: () => resolve() });
    });
    source.start();
    await done;

    // Settle against the closing consensus line, then anchor every decision.
    this.trader.settle((d) =>
      consensusLatest(this.engine.store, { fixtureId: d.fixtureId, market: d.market, outcome: d.side }, endTs),
    );
    for (const decision of this.trader.decisions()) {
      await this.prover.anchor(decision);
    }

    const settled = this.trader.decisions().filter((d) => d.status === 'settled').length;
    return { events: events.length, decisions: this.trader.decisions().length, settled };
  }

  /** Current live state — open positions, recent signals, topology snapshot. */
  state(): AgentState {
    const decisions = [...this.trader.decisions()];
    const state: AgentState = {
      decisions,
      openCount: this.trader.openCount(),
      recentSignals: [...this.recentSignals],
    };
    if (this.lastSignalKey) {
      const byBook = [...latestPctByBook(this.engine.store, this.lastSignalKey, this.lastTs).entries()].map(
        ([bookmakerId, pct]) => ({ bookmakerId, pct }),
      );
      state.consensus = {
        key: this.lastSignalKey,
        consensusPct: consensusLatest(this.engine.store, this.lastSignalKey, this.lastTs),
        byBook,
      };
    }
    return state;
  }
}
