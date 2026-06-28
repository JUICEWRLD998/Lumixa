import { describe, it, expect } from 'vitest';
import {
  normalizeOddsPayload,
  parseOddsTick,
  toDecimalOdds,
  type OddsPayload,
} from './odds.js';

const SAMPLE: OddsPayload = {
  FixtureId: 123456789,
  MessageId: 'msg-abc-001',
  Ts: 1718000000000,
  Bookmaker: 'ExampleBook',
  BookmakerId: 42,
  SuperOddsType: '1X2',
  GameState: 'FirstHalf',
  InRunning: true,
  MarketParameters: '0',
  MarketPeriod: 'FullTime',
  PriceNames: ['Home', 'Draw', 'Away'],
  Prices: [190, 340, 410],
  // DEMARGINED implied probabilities — the raw 1/odds figures (52.632 / 29.412 /
  // 24.390) carry the book's overround and sum to ~106.4; dividing out that
  // overround yields these fair probabilities, which sum to ≈100 as the feed's
  // `Pct` contract guarantees.
  Pct: ['49.451', '27.634', '22.915'],
};

describe('normalizeOddsPayload', () => {
  it('maps wire fields to the normalized tick', () => {
    const tick = normalizeOddsPayload(SAMPLE);
    expect(tick.fixtureId).toBe(123456789);
    expect(tick.messageId).toBe('msg-abc-001');
    expect(tick.market).toBe('1X2');
    expect(tick.inRunning).toBe(true);
    expect(tick.priceNames).toEqual(['Home', 'Draw', 'Away']);
  });

  it('converts ×100 wire prices to decimal odds', () => {
    const tick = normalizeOddsPayload(SAMPLE);
    expect(tick.prices).toEqual([1.9, 3.4, 4.1]);
    expect(toDecimalOdds(190)).toBe(1.9);
  });

  it('parses demargined Pct strings to numbers', () => {
    const tick = normalizeOddsPayload(SAMPLE);
    expect(tick.pct).toEqual([49.451, 27.634, 22.915]);
  });

  it('demargined Pct sums to ≈ 100 (no overround)', () => {
    const tick = normalizeOddsPayload(SAMPLE);
    const sum = tick.pct.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(100, 1);
  });

  it('parseOddsTick validates an unknown value then normalizes', () => {
    const tick = parseOddsTick(SAMPLE as unknown);
    expect(tick.bookmakerId).toBe(42);
  });

  it('throws on a malformed payload', () => {
    expect(() => parseOddsTick({ FixtureId: 'nope' })).toThrow();
  });
});
