import { describe, it, expect } from 'vitest';
import { mean, median, pearson, resampleLOCF, maxLaggedCorr } from './stats.js';

describe('mean / median', () => {
  it('computes the arithmetic mean', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(mean([])).toBeNaN();
  });

  it('computes the median for odd and even lengths (unsorted input)', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNaN();
  });
});

describe('pearson', () => {
  it('is +1 for a perfectly increasing pair, -1 for an inverse pair', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 10);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 10);
  });

  it('returns 0 for a constant (zero-variance) or mismatched series', () => {
    expect(pearson([1, 1, 1], [1, 2, 3])).toBe(0);
    expect(pearson([1, 2], [1, 2, 3])).toBe(0);
  });
});

describe('resampleLOCF', () => {
  it('carries the last observation forward onto the grid', () => {
    const samples = [
      { ts: 0, value: 10 },
      { ts: 10, value: 20 },
      { ts: 25, value: 30 },
    ];
    // grid 0,10,20,30,40 → 10, 20, 20 (last<=20 is the t=10 obs), 30, 30
    expect(resampleLOCF(samples, 0, 40, 10)).toEqual([10, 20, 20, 30, 30]);
  });

  it('backfills the first value before the first sample', () => {
    const samples = [{ ts: 100, value: 5 }];
    expect(resampleLOCF(samples, 80, 120, 20)).toEqual([5, 5, 5]);
  });

  it('returns [] for empty input or a non-positive step', () => {
    expect(resampleLOCF([], 0, 10, 1)).toEqual([]);
    expect(resampleLOCF([{ ts: 0, value: 1 }], 0, 10, 0)).toEqual([]);
  });
});

describe('maxLaggedCorr', () => {
  it('recovers a known lag where the follower trails the leader by 2 steps', () => {
    const leader = [1, 3, 2, 5, 4, 7, 6, 9];
    // follower[t] = leader[t-2]; a constant pre-history at the front
    const follower = [0, 0, 1, 3, 2, 5, 4, 7];
    const { lag, corr } = maxLaggedCorr(leader, follower, 4);
    expect(lag).toBe(2);
    expect(corr).toBeCloseTo(1, 10);
  });

  it('reports lag 0 when the two series are already aligned', () => {
    const a = [1, 2, 3, 4, 5];
    expect(maxLaggedCorr(a, a, 3)).toEqual({ lag: 0, corr: pearson(a, a) });
  });
});
