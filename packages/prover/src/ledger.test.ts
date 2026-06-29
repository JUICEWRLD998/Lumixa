import { describe, it, expect } from 'vitest';
import type { Decision } from '@lumixa/core';
import { InMemoryLedger, SqliteLedger, type LedgerRepository, type LedgerRow } from './ledger.js';

const row = (id: string, over: Partial<LedgerRow> = {}): LedgerRow => ({
  id,
  messageId: `msg-${id}`,
  fixtureId: 123,
  market: '1X2',
  side: 'Home',
  price: 1.9,
  entryPct: 52.6,
  ourTs: 1_718_000_000_000,
  leaderBook: 42,
  stake: 100,
  status: 'open',
  ...over,
});

/** Run the same contract against both implementations. */
function contract(name: string, make: () => LedgerRepository): void {
  describe(name, () => {
    it('upserts and reads back a row', () => {
      const led = make();
      led.upsert(row('a'));
      const got = led.get('a');
      expect(got?.messageId).toBe('msg-a');
      expect(got?.price).toBe(1.9);
      expect(got?.status).toBe('open');
    });

    it('returns undefined for a missing row', () => {
      expect(make().get('nope')).toBeUndefined();
    });

    it('lists rows in insertion order, stable across updates', () => {
      const led = make();
      led.upsert(row('a'));
      led.upsert(row('b'));
      led.upsert(row('c'));
      led.setNarration('a', 'updated a'); // updating must not reorder
      expect(led.list().map((r) => r.id)).toEqual(['a', 'b', 'c']);
    });

    it('attaches narration', () => {
      const led = make();
      led.upsert(row('a'));
      led.setNarration('a', 'backed the leader');
      expect(led.get('a')?.narration).toBe('backed the leader');
    });

    it('records proof + tx signature', () => {
      const led = make();
      led.upsert(row('a'));
      led.setProof('a', { proofRef: 'deadbeef', txSig: 'offline:deadbeef' });
      const got = led.get('a');
      expect(got?.proofRef).toBe('deadbeef');
      expect(got?.txSig).toBe('offline:deadbeef');
    });

    it('records a verify pass', () => {
      const led = make();
      led.upsert(row('a', { clv: 0.02 }));
      led.setVerified('a', { verifiedAt: 999, scoreValidation: 'pending-idl', clv: 0.02, brier: 0.18 });
      const got = led.get('a');
      expect(got?.verifiedAt).toBe(999);
      expect(got?.scoreValidation).toBe('pending-idl');
      expect(got?.brier).toBe(0.18);
    });

    it('upsert replaces an existing row by id', () => {
      const led = make();
      led.upsert(row('a', { status: 'open' }));
      led.upsert(row('a', { status: 'settled', clv: 0.03, closingPct: 55 }));
      const got = led.get('a');
      expect(got?.status).toBe('settled');
      expect(got?.clv).toBe(0.03);
      expect(led.list()).toHaveLength(1);
    });
  });
}

contract('InMemoryLedger', () => new InMemoryLedger());
contract('SqliteLedger (:memory:)', () => new SqliteLedger(':memory:'));

describe('SqliteLedger persistence shape', () => {
  it('keeps optional numeric fields absent when null', () => {
    const led = new SqliteLedger(':memory:');
    led.upsert(row('a') as Decision);
    const got = led.get('a');
    expect(got).toBeDefined();
    expect('clv' in (got as object)).toBe(false);
    expect('narration' in (got as object)).toBe(false);
  });
});
