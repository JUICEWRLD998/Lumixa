import { describe, it, expect } from 'vitest';
import { encodeRecord, makeRecord } from '@lumixa/core';
import { eventsFromLines } from './clock.js';

const FIXTURE = 123456789;

/** A demargined raw `OddsPayload` (its `Pct` sums to ≈100). */
function rawOdds(messageId: string, ts: number) {
  return {
    FixtureId: FIXTURE,
    MessageId: messageId,
    Ts: ts,
    Bookmaker: 'BookA',
    BookmakerId: 7,
    SuperOddsType: '1X2',
    GameState: 'FirstHalf',
    InRunning: true,
    MarketParameters: '0',
    MarketPeriod: 'FullTime',
    PriceNames: ['Home', 'Draw', 'Away'],
    Prices: [190, 340, 410],
    Pct: ['49.451', '27.634', '22.915'],
  };
}

function rawScore(seq: number, ts: number) {
  return { FixtureId: FIXTURE, Seq: seq, Ts: ts, StatKey: 'score', Value: 0 };
}

const oddsLine = (id: string, ts: number): string =>
  encodeRecord(makeRecord('odds', rawOdds(id, ts), ts, { fixtureId: FIXTURE, id }));
const scoreLine = (seq: number, ts: number): string =>
  encodeRecord(makeRecord('score', rawScore(seq, ts), ts, { fixtureId: FIXTURE }));
const metaLine = (ts: number): string =>
  encodeRecord(makeRecord('meta', { fixtureId: FIXTURE }, ts, { fixtureId: FIXTURE }));

describe('eventsFromLines — schema parsing', () => {
  it('decodes odds + score lines and normalizes the payloads', () => {
    const events = eventsFromLines([oddsLine('m1', 1000), scoreLine(1, 2000)]);
    // odds, score, synthetic end
    expect(events.map((e) => e.kind)).toEqual(['odds', 'score', 'end']);
    const odds = events[0];
    expect(odds?.kind === 'odds' && odds.tick.prices).toEqual([1.9, 3.4, 4.1]);
    expect(odds?.kind === 'odds' && odds.tick.pct).toEqual([49.451, 27.634, 22.915]);
    const score = events[1];
    expect(score?.kind === 'score' && score.event.statKey).toBe('score');
  });

  it('maps a meta line to a `start` lifecycle event', () => {
    const events = eventsFromLines([metaLine(500), oddsLine('m1', 1000)]);
    expect(events[0]?.kind).toBe('start');
  });

  it('ignores blank lines', () => {
    const events = eventsFromLines(['', oddsLine('m1', 1000), '   ']);
    expect(events.map((e) => e.kind)).toEqual(['odds', 'end']);
  });

  it('throws on a malformed odds line (fail fast)', () => {
    const bad = encodeRecord(makeRecord('odds', { FixtureId: 'nope' }, 1000, { fixtureId: 1 }));
    expect(() => eventsFromLines([bad])).toThrow();
  });
});

describe('eventsFromLines — ordering', () => {
  it('orders by ts then corpus line order (stable tie-break)', () => {
    // out-of-order timestamps + a same-ts pair to exercise the tie-break
    const events = eventsFromLines([
      oddsLine('late', 3000),
      oddsLine('tieA', 1000),
      oddsLine('tieB', 1000),
    ]);
    const ids = events
      .filter((e) => e.kind === 'odds')
      .map((e) => (e.kind === 'odds' ? e.tick.messageId : ''));
    // tieA before tieB (corpus order at equal ts), then late
    expect(ids).toEqual(['tieA', 'tieB', 'late']);
  });

  it('appends exactly one `end` at the final ts', () => {
    const events = eventsFromLines([oddsLine('m1', 1000), oddsLine('m2', 5000)]);
    const ends = events.filter((e) => e.kind === 'end');
    expect(ends).toHaveLength(1);
    expect(ends[0]?.ts).toBe(5000);
  });
});

describe('eventsFromLines — demargin sanity', () => {
  it('every odds tick has Pct summing to ≈100', () => {
    const events = eventsFromLines([oddsLine('m1', 1000), oddsLine('m2', 2000)]);
    for (const e of events) {
      if (e.kind !== 'odds') continue;
      const sum = e.tick.pct.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(100, 1);
    }
  });
});
