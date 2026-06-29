import { describe, it, expect } from 'vitest';
import type { Decision } from '@lumixa/core';
import { hashDecision } from './hash.js';

const base: Decision = {
  id: 'dec-msg-1-Home',
  messageId: 'msg-1',
  fixtureId: 123,
  market: '1X2',
  side: 'Home',
  price: 1.9,
  entryPct: 52.6,
  ourTs: 1_718_000_000_000,
  leaderBook: 42,
  stake: 100,
  status: 'open',
};

describe('hashDecision', () => {
  it('is a 64-char hex sha256', () => {
    expect(hashDecision(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', () => {
    expect(hashDecision(base)).toBe(hashDecision({ ...base }));
  });

  it('ignores property insertion order (canonical field set)', () => {
    const reordered: Decision = {
      status: 'open',
      stake: 100,
      leaderBook: 42,
      ourTs: 1_718_000_000_000,
      entryPct: 52.6,
      price: 1.9,
      side: 'Home',
      market: '1X2',
      fixtureId: 123,
      messageId: 'msg-1',
      id: 'dec-msg-1-Home',
    };
    expect(hashDecision(reordered)).toBe(hashDecision(base));
  });

  it('ignores grading fields filled in later (clv/closingPct/txSig/status)', () => {
    const settled: Decision = {
      ...base,
      status: 'settled',
      closingPct: 55,
      clv: 0.024,
      brier: 0.18,
      txSig: 'abc',
    };
    expect(hashDecision(settled)).toBe(hashDecision(base));
  });

  it('changes when an immutable fact changes', () => {
    expect(hashDecision({ ...base, side: 'Away' })).not.toBe(hashDecision(base));
    expect(hashDecision({ ...base, price: 2.0 })).not.toBe(hashDecision(base));
  });
});
