/**
 * Pure numeric helpers for the SENSE layer — mean/median, Pearson correlation,
 * and the resample + lagged-correlation primitives the lead-lag attribution is
 * built on. No domain types here (operates on plain numbers / `TimedValue`s) so
 * it stays trivially testable and reusable.
 */

/** A timestamped scalar — the input shape for {@link resampleLOCF}. */
export interface TimedValue {
  ts: number;
  value: number;
}

/** Arithmetic mean, or `NaN` for an empty input. */
export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return NaN;
  let sum = 0;
  for (const x of xs) sum += x;
  return sum / xs.length;
}

/** Median (linear-interpolated for even length), or `NaN` for empty input. */
export function median(xs: readonly number[]): number {
  if (xs.length === 0) return NaN;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  if (sorted.length % 2 === 1) return sorted[mid] as number;
  return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/**
 * Pearson correlation of two equal-length series. Returns `0` when either
 * series is constant (zero variance) or lengths differ / are < 2 — a degenerate
 * pair carries no linear signal, so 0 is the safe "no correlation" answer.
 */
export function pearson(xs: readonly number[], ys: readonly number[]): number {
  const n = xs.length;
  if (n < 2 || ys.length !== n) return 0;
  const mx = mean(xs);
  const my = mean(ys);
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = (xs[i] as number) - mx;
    const dy = (ys[i] as number) - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  if (vx === 0 || vy === 0) return 0;
  return cov / Math.sqrt(vx * vy);
}

/**
 * Resample an irregular, timestamped series onto a uniform grid by
 * last-observation-carried-forward. Grid points are `startTs, startTs+stepMs, …`
 * up to and including `endTs`. Samples must be ascending in `ts`.
 *
 * Before the first sample we backfill the first value (rather than emit `NaN`),
 * so a bounded window never injects holes that would poison a correlation.
 */
export function resampleLOCF(
  samples: readonly TimedValue[],
  startTs: number,
  endTs: number,
  stepMs: number,
): number[] {
  const out: number[] = [];
  const first = samples[0];
  if (first === undefined || stepMs <= 0) return out;

  let i = 0;
  let last = first.value; // backward-fill until the first sample's ts
  for (let t = startTs; t <= endTs; t += stepMs) {
    while (i < samples.length && (samples[i] as TimedValue).ts <= t) {
      last = (samples[i] as TimedValue).value;
      i += 1;
    }
    out.push(last);
  }
  return out;
}

/** Result of a lagged-correlation scan. */
export interface LaggedCorr {
  /** non-negative lag (in grid steps) at which `corr` is maximal */
  lag: number;
  /** Pearson correlation at that lag (`leader[t]` vs `follower[t+lag]`) */
  corr: number;
}

/**
 * Scan lags `0..maxLagSteps` and return the lag at which `leader` best predicts
 * a LATER `follower` — i.e. `leader[t]` correlated with `follower[t + lag]`.
 * A high correlation at lag > 0 means the follower trails the leader: exactly
 * the "consensus follows this book" relationship the leader-attribution wants.
 *
 * Both inputs must be the same uniform grid (use {@link resampleLOCF}).
 */
export function maxLaggedCorr(
  leader: readonly number[],
  follower: readonly number[],
  maxLagSteps: number,
): LaggedCorr {
  let best: LaggedCorr = { lag: 0, corr: pearson(leader, follower) };
  const maxLag = Math.max(0, Math.min(maxLagSteps, leader.length - 2));
  for (let lag = 1; lag <= maxLag; lag += 1) {
    const a = leader.slice(0, leader.length - lag);
    const b = follower.slice(lag);
    const corr = pearson(a, b);
    if (corr > best.corr) best = { lag, corr };
  }
  return best;
}
