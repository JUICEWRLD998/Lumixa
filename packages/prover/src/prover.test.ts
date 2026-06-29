import { describe, it, expect } from 'vitest';
import { sha256Hex } from '@lumixa/chain';
import { clv } from '@lumixa/engine';
import type { Decision } from '@lumixa/core';
import { InMemoryLedger } from './ledger.js';
import { hashDecision } from './hash.js';
import { Prover, parseOddsMerkleProof, OFFLINE_TXSIG_PREFIX, type OddsMerkleProof } from './prover.js';

const decision: Decision = {
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
  status: 'settled',
  closingPct: 55,
  clv: clv(52.6, 55),
  brier: 0.18,
};

/** Build a real 2-leaf proof for `leaf`, with a sibling on the right. */
function proofFor(leaf: string): OddsMerkleProof {
  const sibling = sha256Hex('sibling-leaf');
  const root = sha256Hex(Buffer.concat([Buffer.from(leaf, 'hex'), Buffer.from(sibling, 'hex')]));
  return { leaf, nodes: [{ hash: sibling, isRightSibling: true }], root };
}

describe('Prover — offline anchor', () => {
  it('stores a deterministic offline sentinel signature (never a fake base58 sig)', async () => {
    const ledger = new InMemoryLedger();
    const prover = new Prover({ ledger });
    const txSig = await prover.anchor(decision);
    expect(txSig).toBe(`${OFFLINE_TXSIG_PREFIX}${hashDecision(decision)}`);
    expect(ledger.get(decision.id)?.proofRef).toBe(hashDecision(decision));
  });

  it("'live' mode requires a connection and wallet", () => {
    expect(() => new Prover({ ledger: new InMemoryLedger(), mode: 'live' })).toThrow(/live/);
  });
});

describe('Prover — verify (the Phase-3 exit gate)', () => {
  it('verifies an anchored decision: merkle proof + memo + CLV', async () => {
    const ledger = new InMemoryLedger();
    const leaf = sha256Hex(decision.messageId);
    const prover = new Prover({ ledger, proofFetcher: async () => proofFor(leaf) });
    await prover.anchor(decision);

    const res = await prover.verify(decision.id, 1_718_000_500_000);
    expect(res.merkleVerified).toBe(true);
    expect(res.memoConfirmed).toBe(true);
    expect(res.scoreValidation).toBe('pending-idl');
    expect(res.clv).toBeCloseTo(clv(52.6, 55));
    expect(res.txSig?.startsWith(OFFLINE_TXSIG_PREFIX)).toBe(true);
    expect(res.explorerUrl).toBeUndefined(); // offline ⇒ no Explorer link
    expect(ledger.get(decision.id)?.verifiedAt).toBe(1_718_000_500_000);
  });

  it('fails merkle verification on a tampered proof', async () => {
    const ledger = new InMemoryLedger();
    const wrongLeaf = sha256Hex('not-the-tick');
    const prover = new Prover({ ledger, proofFetcher: async () => proofFor(wrongLeaf) });
    await prover.anchor(decision);

    const res = await prover.verify(decision.id, 1);
    expect(res.merkleVerified).toBe(false);
    expect(res.memoConfirmed).toBe(true); // anchor still matches; proof did not
  });

  it('reports merkleVerified=false when no proof is available', async () => {
    const ledger = new InMemoryLedger();
    const prover = new Prover({ ledger });
    await prover.anchor(decision);
    const res = await prover.verify(decision.id, 1);
    expect(res.merkleVerified).toBe(false);
  });

  it('throws for an unknown decision', async () => {
    const prover = new Prover({ ledger: new InMemoryLedger() });
    await expect(prover.verify('ghost', 1)).rejects.toThrow(/unknown decision/);
  });
});

describe('parseOddsMerkleProof', () => {
  it('extracts leaf/nodes/root from a documented-ish bundle', () => {
    const parsed = parseOddsMerkleProof({
      leaf: 'aa',
      root: 'bb',
      nodes: [{ hash: 'cc', isRightSibling: true }],
    });
    expect(parsed).toEqual({ leaf: 'aa', root: 'bb', nodes: [{ hash: 'cc', isRightSibling: true }] });
  });

  it('tolerates alternate field spellings (statProof / eventStatRoot / right)', () => {
    const parsed = parseOddsMerkleProof({
      statToProve: 'aa',
      eventStatRoot: 'bb',
      statProof: [{ sibling: 'cc', right: true }],
    });
    expect(parsed?.leaf).toBe('aa');
    expect(parsed?.root).toBe('bb');
    expect(parsed?.nodes[0]).toEqual({ hash: 'cc', isRightSibling: true });
  });

  it('returns undefined for an unrecognized shape (never guesses a root)', () => {
    expect(parseOddsMerkleProof(null)).toBeUndefined();
    expect(parseOddsMerkleProof({ leaf: 'aa' })).toBeUndefined();
    expect(parseOddsMerkleProof({ leaf: 'aa', root: 'bb' })).toBeUndefined();
  });
});
