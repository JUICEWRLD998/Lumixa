import { z } from 'zod';

/** Kind of line stored in a replay-corpus JSONL file. */
export type RecordKind = 'odds' | 'score' | 'meta';

/**
 * One line of the replay corpus. The recorder appends these to
 * `data/<fixtureId>-<date>.jsonl`; the replay engine reads them back in order.
 * `payload` is the RAW wire payload — normalization happens on read so the
 * corpus is a faithful, re-parseable capture of exactly what the feed sent.
 */
export interface RecordEnvelope<T = unknown> {
  kind: RecordKind;
  /** wall-clock capture time (ms) — the replay clock's time base */
  ts: number;
  fixtureId?: number;
  /** unique id of the underlying tick when available (odds `MessageId`) */
  id?: string;
  /** raw payload as received from the feed */
  payload: T;
}

// NOTE: zod infers `z.unknown()` as an OPTIONAL property, so the inferred
// schema type is not assignable to `RecordEnvelope` (whose `payload` is
// required). We therefore omit the explicit `z.ZodType<RecordEnvelope>`
// annotation and assert the parsed result back to `RecordEnvelope` in
// `decodeRecord` — the runtime shape is identical.
export const RecordEnvelopeSchema = z.object({
  kind: z.enum(['odds', 'score', 'meta']),
  ts: z.number(),
  fixtureId: z.number().optional(),
  id: z.string().optional(),
  payload: z.unknown(),
});

/** Build a corpus envelope with a stamped capture time. */
export function makeRecord<T>(
  kind: RecordKind,
  payload: T,
  ts: number,
  opts: { fixtureId?: number; id?: string } = {},
): RecordEnvelope<T> {
  return { kind, ts, payload, ...opts };
}

/** Serialize an envelope to a single JSONL line (no trailing newline). */
export function encodeRecord<T>(env: RecordEnvelope<T>): string {
  return JSON.stringify(env);
}

/** Parse and validate a single JSONL line into an envelope. */
export function decodeRecord(line: string): RecordEnvelope {
  return RecordEnvelopeSchema.parse(JSON.parse(line)) as RecordEnvelope;
}
