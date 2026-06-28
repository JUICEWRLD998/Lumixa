import { readFileSync } from 'node:fs';
import {
  decodeRecord,
  normalizeScorePayload,
  parseOddsTick,
  type MarketEvent,
} from '@lumixa/core';

/**
 * Pure corpus → ordered {@link MarketEvent}s transform.
 *
 * Decodes each non-empty JSONL line via core's `decodeRecord`, re-normalizes
 * the raw payload (odds ⇒ `parseOddsTick`, score ⇒ `normalizeScorePayload`,
 * meta ⇒ a `start` lifecycle event), then orders the result with a STABLE,
 * explicit tie-break and appends a single synthetic `end` event.
 *
 * Determinism note: we sort by `(ts, originalIndex)` rather than relying on
 * `Array.prototype.sort` stability. Two ticks with identical capture `ts`
 * therefore always emit in corpus line order — the property the determinism
 * test depends on.
 *
 * Fails fast: a malformed line throws (matching `replay-check.ts`'s fail-on-
 * corruption stance) rather than being silently skipped.
 *
 * @param lines raw JSONL lines (file order preserved); blanks are ignored.
 */
export function eventsFromLines(lines: string[]): MarketEvent[] {
  const indexed: Array<{ ev: MarketEvent; seq: number }> = [];

  let seq = 0;
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    const env = decodeRecord(line);
    const ev = toEvent(env);
    indexed.push({ ev, seq });
    seq += 1;
  }

  indexed.sort((a, b) => a.ev.ts - b.ev.ts || a.seq - b.seq);
  const events = indexed.map((x) => x.ev);

  const last = events[events.length - 1];
  if (last !== undefined) {
    events.push({ kind: 'end', ts: last.ts, fixtureId: last.fixtureId });
  }
  return events;
}

/** Map one decoded corpus envelope to a normalized {@link MarketEvent}. */
function toEvent(env: ReturnType<typeof decodeRecord>): MarketEvent {
  switch (env.kind) {
    case 'odds': {
      const tick = parseOddsTick(env.payload);
      return { kind: 'odds', ts: env.ts, fixtureId: env.fixtureId ?? tick.fixtureId, tick };
    }
    case 'score': {
      const event = normalizeScorePayload(env.payload);
      return { kind: 'score', ts: env.ts, fixtureId: env.fixtureId ?? event.fixtureId, event };
    }
    case 'meta':
      return { kind: 'start', ts: env.ts, fixtureId: env.fixtureId ?? 0, meta: env.payload };
  }
}

/**
 * Read one or more corpus JSONL files (in the given order) and produce the
 * merged, time-ordered {@link MarketEvent} stream. Multiple files are
 * concatenated in path order before ordering, so events from different fixtures
 * interleave by `ts` while equal-`ts` ties resolve to overall corpus order.
 *
 * @param paths corpus file paths (e.g. `data/<fixtureId>-<date>.jsonl`)
 */
export function loadCorpusEvents(paths: string[]): MarketEvent[] {
  const lines: string[] = [];
  for (const path of paths) {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      lines.push(line);
    }
  }
  return eventsFromLines(lines);
}
