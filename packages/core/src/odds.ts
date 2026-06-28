import { z } from 'zod';

/**
 * Raw `OddsPayload` exactly as returned by
 * `GET /api/odds/snapshot/{fixtureId}` and the SSE odds stream.
 *
 * Field names are PascalCase to match the wire format. We validate the raw
 * shape, then map it into the camelCase normalized {@link OddsTick} the rest
 * of the system consumes. We persist the raw payload to the replay corpus so
 * nothing is lost — normalization is a pure, replayable transform.
 */
export const OddsPayloadSchema = z.object({
  FixtureId: z.number(),
  MessageId: z.string(),
  Ts: z.number(),
  Bookmaker: z.string(),
  BookmakerId: z.number(),
  SuperOddsType: z.string(),
  GameState: z.string(),
  InRunning: z.boolean(),
  MarketParameters: z.string(),
  MarketPeriod: z.string(),
  PriceNames: z.array(z.string()),
  /** decimal odds ×100 — `190` ⇒ 1.90 */
  Prices: z.array(z.number()),
  /** demargined implied probability %, as 3dp strings — `"52.632"` */
  Pct: z.array(z.string()),
});

export type OddsPayload = z.infer<typeof OddsPayloadSchema>;

/**
 * Normalized odds tick — one quote from one bookmaker for one market at one
 * instant. `messageId` is the unique tick id we anchor on-chain.
 */
export interface OddsTick {
  fixtureId: number;
  /** unique tick id — anchored on devnet */
  messageId: string;
  /** event timestamp (ms since epoch) */
  ts: number;
  bookmaker: string;
  bookmakerId: number;
  /** market type, e.g. `"1X2"` (from `SuperOddsType`) */
  market: string;
  gameState: string;
  /** in-play vs pre-match */
  inRunning: boolean;
  marketParameters: string;
  marketPeriod: string;
  /** outcome labels, e.g. `["Home","Draw","Away"]` */
  priceNames: string[];
  /** decimal odds — `1.90` (converted from the wire's ×100 integers) */
  prices: number[];
  /** demargined implied probability, percent — `52.632` (sums ≈ 100) */
  pct: number[];
}

/** Convert a wire ×100 integer price to decimal odds (`190` ⇒ `1.90`). */
export const toDecimalOdds = (priceX100: number): number => priceX100 / 100;

/** Parse the 3dp percent string array into numbers (`"52.632"` ⇒ `52.632`). */
export const parsePct = (pct: string[]): number[] =>
  pct.map((p) => {
    const n = Number(p);
    if (!Number.isFinite(n)) {
      throw new Error(`invalid Pct value: ${JSON.stringify(p)}`);
    }
    return n;
  });

/**
 * Map a validated raw {@link OddsPayload} into a normalized {@link OddsTick}.
 * Pure and total: same input ⇒ same output, which keeps replay deterministic.
 */
export function normalizeOddsPayload(raw: OddsPayload): OddsTick {
  return {
    fixtureId: raw.FixtureId,
    messageId: raw.MessageId,
    ts: raw.Ts,
    bookmaker: raw.Bookmaker,
    bookmakerId: raw.BookmakerId,
    market: raw.SuperOddsType,
    gameState: raw.GameState,
    inRunning: raw.InRunning,
    marketParameters: raw.MarketParameters,
    marketPeriod: raw.MarketPeriod,
    priceNames: raw.PriceNames,
    prices: raw.Prices.map(toDecimalOdds),
    pct: parsePct(raw.Pct),
  };
}

/** Validate an unknown value as a raw payload, then normalize it. */
export function parseOddsTick(value: unknown): OddsTick {
  return normalizeOddsPayload(OddsPayloadSchema.parse(value));
}
