import { describe, it, expect, beforeEach } from 'vitest';
import { sha256Hex } from '@lumixa/chain';
import type { Decision } from '@lumixa/core';
import { InMemoryLedger, Prover, hashDecision, type OddsMerkleProof } from '@lumixa/prover';
import { Agent } from './agent.js';
import { buildServer } from './server.js';

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
  clv: 0.024,
};

/** A real 2-leaf proof for the decision's message id. */
function proofFor(messageId: string): OddsMerkleProof {
  const leaf = sha256Hex(messageId);
  const sibling = sha256Hex('sibling');
  const root = sha256Hex(Buffer.concat([Buffer.from(leaf, 'hex'), Buffer.from(sibling, 'hex')]));
  return { leaf, nodes: [{ hash: sibling, isRightSibling: true }], root };
}

function build() {
  const ledger = new InMemoryLedger();
  const prover = new Prover({ ledger, proofFetcher: async (id) => proofFor(id) });
  const agent = new Agent({ prover, ledger });
  const app = buildServer({ ledger, prover, agent, now: () => 4242 });
  return { ledger, prover, agent, app };
}

describe('Lumixa API', () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(async () => {
    ctx = build();
    await ctx.prover.anchor(decision);
  });

  it('GET /health', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, service: 'lumixa' });
  });

  it('GET /ledger returns anchored rows', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/ledger' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.count).toBe(1);
    expect(body.decisions[0].id).toBe(decision.id);
    expect(body.decisions[0].txSig).toBe(`offline:${hashDecision(decision)}`);
  });

  it('GET /verify/:id re-verifies merkle + memo, reports pending-idl', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: `/verify/${decision.id}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.merkleVerified).toBe(true);
    expect(body.memoConfirmed).toBe(true);
    expect(body.scoreValidation).toBe('pending-idl');
    expect(body.explorerUrl).toBeUndefined();
  });

  it('GET /verify/:id 404s for an unknown decision', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/verify/ghost' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatch(/unknown decision/);
  });

  it('GET /state returns the live agent shape', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/state' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.decisions)).toBe(true);
    expect(typeof body.openCount).toBe('number');
    expect(Array.isArray(body.recentSignals)).toBe(true);
  });

  it('POST /replay/start rejects an invalid body', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/replay/start', payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid body');
  });
});
