import { describe, it, expect } from 'vitest';
import type { Decision } from '@lumixa/core';
import { createNarrator } from './narrate.js';

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
};

describe('createNarrator', () => {
  it('returns the injected completion text', async () => {
    const narrate = createNarrator({}, async () => 'Backed the leader before the consensus caught up.');
    expect(await narrate(decision)).toBe('Backed the leader before the consensus caught up.');
  });

  it('passes a factual prompt mentioning the decision specifics', async () => {
    let seen = '';
    const narrate = createNarrator({}, async (prompt) => {
      seen = prompt;
      return 'ok';
    });
    await narrate(decision);
    expect(seen).toContain('Home');
    expect(seen).toContain('book 42');
    expect(seen).toContain('123');
  });

  it('never throws — a failing completion yields undefined', async () => {
    const narrate = createNarrator({}, async () => {
      throw new Error('provider down');
    });
    expect(await narrate(decision)).toBeUndefined();
  });

  it('is a no-op (undefined) when no API key is configured', async () => {
    const narrate = createNarrator({});
    expect(await narrate(decision)).toBeUndefined();
  });
});
