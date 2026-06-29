import { describe, it, expect } from 'vitest';
import { parseStrategy, type Signal } from '@lumixa/engine';
import { Trader } from './trader.js';

/** Build a Signal; overrides patch the defaults. */
function signal(over: Partial<Signal> = {}): Signal {
  const fixtureId = over.fixtureId ?? 1;
  const market = over.market ?? '1X2';
  const outcome = over.outcome ?? 'Home';
  const consensusPct = over.consensusPct ?? 50;
  return {
    fixtureId,
    market,
    outcome,
    leaderBook: over.leaderBook ?? 9,
    leaderPct: over.leaderPct ?? 53,
    consensusPct,
    entryPrice: over.entryPrice ?? 100 / consensusPct,
    leadLag: over.leadLag ?? { corr: 0.9, lagSteps: 2 },
    steam: over.steam ?? {
      bookmakerId: 9,
      market,
      outcome,
      fromPct: 50,
      toPct: 53,
      delta: 3,
      direction: 1,
      windowStartTs: 0,
      ts: 1000,
    },
    messageId: over.messageId ?? `msg-${fixtureId}-${market}-${outcome}`,
    ts: over.ts ?? 1000,
  };
}

describe('Trader.onSignal', () => {
  it('opens a well-formed Decision from a signal', () => {
    const trader = new Trader();
    const decision = trader.onSignal(signal({ consensusPct: 50, leaderBook: 7 }));
    expect(decision).toMatchObject({
      id: 'dec-msg-1-1X2-Home-Home',
      messageId: 'msg-1-1X2-Home',
      fixtureId: 1,
      market: '1X2',
      side: 'Home',
      entryPct: 50,
      price: 2, // 100 / 50
      leaderBook: 7,
      status: 'open',
    });
    expect(trader.openCount()).toBe(1);
  });

  it('dedupes: will not re-enter an already-open (fixture, market, outcome)', () => {
    const trader = new Trader();
    expect(trader.onSignal(signal())).toBeDefined();
    expect(trader.onSignal(signal())).toBeUndefined();
    expect(trader.openCount()).toBe(1);
  });

  it('enforces maxConcurrent', () => {
    const cfg = parseStrategy({ maxConcurrent: 2 });
    const trader = new Trader(cfg);
    expect(trader.onSignal(signal({ fixtureId: 1 }))).toBeDefined();
    expect(trader.onSignal(signal({ fixtureId: 2 }))).toBeDefined();
    expect(trader.onSignal(signal({ fixtureId: 3 }))).toBeUndefined();
    expect(trader.openCount()).toBe(2);
  });

  it('enforces maxMarketExposure per (fixture, market)', () => {
    const cfg = parseStrategy({ maxStake: 100, maxMarketExposure: 150 });
    const trader = new Trader(cfg);
    expect(trader.onSignal(signal({ outcome: 'Home' }))).toBeDefined();
    // second stake of 100 would push the (1,1X2) book to 200 > 150
    expect(trader.onSignal(signal({ outcome: 'Draw' }))).toBeUndefined();
  });
});

describe('Trader.settle', () => {
  it('fills closingPct + clv and marks settled (positive when line moved our way)', () => {
    const trader = new Trader();
    trader.onSignal(signal({ outcome: 'Home', consensusPct: 50 }));
    trader.settle(() => 55); // closed at 55% → +5pp

    const [decision] = trader.decisions();
    expect(decision?.status).toBe('settled');
    expect(decision?.closingPct).toBe(55);
    expect(decision?.clv).toBeCloseTo(0.05, 10);
    expect(trader.openCount()).toBe(0);
  });

  it('leaves a position open when the resolver cannot price it', () => {
    const trader = new Trader();
    trader.onSignal(signal());
    trader.settle(() => undefined);
    expect(trader.decisions()[0]?.status).toBe('open');
  });
});
