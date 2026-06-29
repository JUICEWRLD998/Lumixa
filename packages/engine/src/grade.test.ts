import { describe, it, expect } from 'vitest';
import { clv, brier } from './grade.js';

describe('clv', () => {
  it('is positive when the closing line moved toward our outcome', () => {
    // entered at 50% fair, closed at 55% → line moved our way → +0.05 fraction
    expect(clv(50, 55)).toBeCloseTo(0.05, 10);
  });

  it('is negative when the line moved against us', () => {
    expect(clv(55, 50)).toBeCloseTo(-0.05, 10);
  });

  it('is zero when entry equals close', () => {
    expect(clv(48.2, 48.2)).toBe(0);
  });
});

describe('brier', () => {
  it('rewards a confident correct call and punishes a confident wrong one', () => {
    // 90% on the winner → (0.9-1)^2 = 0.01 ; 90% on a loser → (0.9-0)^2 = 0.81
    expect(brier(90, true)).toBeCloseTo(0.01, 10);
    expect(brier(90, false)).toBeCloseTo(0.81, 10);
  });

  it('is 0.25 for a coin-flip prediction either way', () => {
    expect(brier(50, true)).toBeCloseTo(0.25, 10);
    expect(brier(50, false)).toBeCloseTo(0.25, 10);
  });
});
