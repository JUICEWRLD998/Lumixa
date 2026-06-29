import { describe, it, expect } from 'vitest';
import { detectSteam } from './steam.js';
import { DEFAULT_STRATEGY } from './strategy.js';
import type { Series, SeriesPoint } from './store.js';

const points = (...pairs: Array<[ts: number, pct: number]>): SeriesPoint[] =>
  pairs.map(([ts, pct]) => ({ ts, pct, price: 100 / pct }));

const series = (pts: SeriesPoint[], bookmakerId = 7): Series => ({
  fixtureId: 1,
  market: '1X2',
  outcome: 'Home',
  bookmakerId,
  points: pts,
});

// DEFAULT_STRATEGY: θ = 1.5pp, w = 120_000ms.
const NOW = 200_000;

describe('detectSteam', () => {
  it('fires when Pct shifts beyond θ within the window (direction +1)', () => {
    const s = series(points([0, 50], [90_000, 50], [190_000, 52]));
    const move = detectSteam(s, NOW, DEFAULT_STRATEGY);
    expect(move).toBeDefined();
    expect(move?.delta).toBeCloseTo(2, 10);
    expect(move?.direction).toBe(1);
    expect(move?.bookmakerId).toBe(7);
  });

  it('fires with direction -1 on a drift (Pct falling)', () => {
    const s = series(points([0, 50], [190_000, 47]));
    expect(detectSteam(s, NOW, DEFAULT_STRATEGY)?.direction).toBe(-1);
  });

  it('does not fire for a sub-threshold shift', () => {
    const s = series(points([0, 50], [190_000, 51]));
    expect(detectSteam(s, NOW, DEFAULT_STRATEGY)).toBeUndefined();
  });

  it('does not fire when the move happened before the window', () => {
    // jump to 52 at t=50_000, flat since → window start (80_000) already sees 52
    const s = series(points([0, 50], [50_000, 52], [190_000, 52]));
    expect(detectSteam(s, NOW, DEFAULT_STRATEGY)).toBeUndefined();
  });

  it('returns undefined for an empty series', () => {
    expect(detectSteam(series([]), NOW, DEFAULT_STRATEGY)).toBeUndefined();
  });
});
