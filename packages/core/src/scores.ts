import { z } from 'zod';

/**
 * Normalized score event from the scores SSE stream / sequence endpoint.
 *
 * The TxLINE scores schema is richer and fixture-dependent, so we keep a
 * permissive normalized shape plus the raw payload. `seq` + `statKey` are the
 * coordinates used by `validateStat` for on-chain Merkle verification.
 */
export interface ScoreEvent {
  fixtureId: number;
  /** monotonic sequence number within a fixture */
  seq: number;
  /** event timestamp (ms since epoch) */
  ts: number;
  /** stat coordinate used by `validateStat`, e.g. `"score"`, `"goal"` */
  statKey: string;
  /** current game phase, when present (`"FirstHalf"`, `"FullTime"`, …) */
  gameState?: string;
  /** stat value(s), schema-dependent — kept generic on purpose */
  value?: unknown;
  /** raw payload exactly as received, for replay + audit */
  raw: unknown;
}

/**
 * Loose validator for raw score payloads. The wire schema varies by stat, so
 * we only assert the coordinates we depend on and pass the rest through.
 */
export const RawScoreSchema = z
  .object({
    FixtureId: z.number().optional(),
    fixtureId: z.number().optional(),
    Seq: z.number().optional(),
    seq: z.number().optional(),
    Ts: z.number().optional(),
    ts: z.number().optional(),
    StatKey: z.string().optional(),
    statKey: z.string().optional(),
    GameState: z.string().optional(),
    Value: z.unknown().optional(),
  })
  .passthrough();

export type RawScore = z.infer<typeof RawScoreSchema>;

const firstNumber = (...vals: Array<number | undefined>): number | undefined =>
  vals.find((v): v is number => typeof v === 'number');

const firstString = (...vals: Array<string | undefined>): string | undefined =>
  vals.find((v): v is string => typeof v === 'string');

/**
 * Normalize a raw score payload into a {@link ScoreEvent}. Accepts both
 * PascalCase and camelCase keys; falls back to `0` / `""` for missing
 * coordinates so a malformed tick never throws mid-stream (the raw payload is
 * always preserved for later re-parsing).
 */
export function normalizeScorePayload(value: unknown): ScoreEvent {
  const raw = RawScoreSchema.parse(value);
  return {
    fixtureId: firstNumber(raw.FixtureId, raw.fixtureId) ?? 0,
    seq: firstNumber(raw.Seq, raw.seq) ?? 0,
    ts: firstNumber(raw.Ts, raw.ts) ?? 0,
    statKey: firstString(raw.StatKey, raw.statKey) ?? '',
    gameState: firstString(raw.GameState),
    value: raw.Value,
    raw: value,
  };
}
