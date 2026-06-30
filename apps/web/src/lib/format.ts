/* Display formatters — kept pure so the same logic is testable + reused. */

/** CLV is a fraction (e.g. 0.112). Show as signed percentage points: `+11.20`. */
export function formatClv(clv: number | undefined): string {
  if (clv === undefined) return '—';
  const pp = clv * 100;
  return `${pp >= 0 ? '+' : ''}${pp.toFixed(2)}`;
}

/** Brier is lower-is-better, 0..1. */
export function formatBrier(brier: number | undefined): string {
  if (brier === undefined) return '—';
  return brier.toFixed(3);
}

/** Decimal odds, two places: `2.05`. */
export function formatOdds(price: number | undefined): string {
  if (price === undefined) return '—';
  return price.toFixed(2);
}

/** Demargined implied probability percent: `48.8%`. */
export function formatPct(pct: number | undefined, digits = 1): string {
  if (pct === undefined) return '—';
  return `${pct.toFixed(digits)}%`;
}

/** Truncate a hash/signature for compact display: `1d33c6fa…5c707643`. */
export function shortHash(h: string | undefined, head = 8, tail = 8): string {
  if (!h) return '—';
  const bare = h.replace(/^offline:/, '');
  if (bare.length <= head + tail + 1) return bare;
  return `${bare.slice(0, head)}…${bare.slice(-tail)}`;
}

/** Virtual-clock ms → `mm:ss` match clock. */
export function matchClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Stable, readable colour for a bookmaker id (used in charts + topology). */
export function bookColor(bookmakerId: number): string {
  const palette = [
    '#5b6878',
    '#7c93a8',
    '#9d8ec0',
    '#6fa8b0',
    '#b08e6f',
    '#8a9bb5',
    '#a87c98',
    '#7fb09a',
  ];
  return palette[Math.abs(bookmakerId) % palette.length] as string;
}

/** Human label for a bookmaker id. */
export function bookLabel(bookmakerId: number): string {
  return `Book ${bookmakerId}`;
}
