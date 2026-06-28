import { describe, it, expect } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import {
  epochDay,
  deriveDailyScoresRootsPda,
  MS_PER_DAY,
  DAILY_SCORES_ROOTS_SEED,
} from './validate-stat.js';

/** Deterministic dummy program id — no real program needed for PDA math. */
const PROGRAM_ID = PublicKey.default;

describe('epochDay', () => {
  it('floors ts / 86_400_000', () => {
    // epoch day 19884 = any ts within that UTC day.
    const ts = 19884 * MS_PER_DAY;
    expect(epochDay(ts)).toBe(19884);
    // mid-day still maps to the same bucket.
    expect(epochDay(ts + 12 * 3_600_000)).toBe(19884);
    // one ms before the next day boundary.
    expect(epochDay(ts + MS_PER_DAY - 1)).toBe(19884);
    // the boundary itself rolls over.
    expect(epochDay(ts + MS_PER_DAY)).toBe(19885);
  });
});

describe('deriveDailyScoresRootsPda', () => {
  it('encodes epochDay 19884 as little-endian u16 bytes [0xAC, 0x4D]', () => {
    const buf = Buffer.alloc(2);
    buf.writeUInt16LE(19884, 0);
    expect([buf[0], buf[1]]).toEqual([0xac, 0x4d]);
  });

  it('uses the documented seed string', () => {
    expect(DAILY_SCORES_ROOTS_SEED).toBe('daily_scores_roots');
  });

  it('returns a PublicKey and a u8 bump for a known ts', () => {
    const ts = 19884 * MS_PER_DAY;
    const [pda, bump] = deriveDailyScoresRootsPda(PROGRAM_ID, ts);
    expect(pda).toBeInstanceOf(PublicKey);
    expect(typeof bump).toBe('number');
    expect(bump).toBeGreaterThanOrEqual(0);
    expect(bump).toBeLessThanOrEqual(255);
  });

  it('is deterministic and matches a hand-built seed derivation', () => {
    const ts = 19884 * MS_PER_DAY;
    const [pda] = deriveDailyScoresRootsPda(PROGRAM_ID, ts);

    const epochDayLe = Buffer.alloc(2);
    epochDayLe.writeUInt16LE(19884, 0);
    const [expected] = PublicKey.findProgramAddressSync(
      [Buffer.from(DAILY_SCORES_ROOTS_SEED, 'utf8'), epochDayLe],
      PROGRAM_ID,
    );
    expect(pda.toBase58()).toBe(expected.toBase58());
  });

  it('buckets different times in the same UTC day to the same PDA', () => {
    const base = 19884 * MS_PER_DAY;
    const [a] = deriveDailyScoresRootsPda(PROGRAM_ID, base);
    const [b] = deriveDailyScoresRootsPda(PROGRAM_ID, base + 12 * 3_600_000);
    expect(a.toBase58()).toBe(b.toBase58());
  });

  it('throws when epochDay overflows u16', () => {
    const tooFar = (0xffff + 1) * MS_PER_DAY;
    expect(() => deriveDailyScoresRootsPda(PROGRAM_ID, tooFar)).toThrow(/u16 range/);
  });
});
