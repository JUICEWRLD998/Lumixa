import { describe, it, expect } from 'vitest';
import { makeRecord, encodeRecord, decodeRecord } from './record.js';

describe('record envelope', () => {
  it('round-trips through encode/decode unchanged', () => {
    const env = makeRecord('odds', { MessageId: 'm1', x: 1 }, 1718000000000, {
      fixtureId: 99,
      id: 'm1',
    });
    const line = encodeRecord(env);
    expect(line).not.toContain('\n');
    const back = decodeRecord(line);
    expect(back).toEqual(env);
  });

  it('rejects a line missing required fields', () => {
    expect(() => decodeRecord(JSON.stringify({ kind: 'odds' }))).toThrow();
  });

  it('rejects an unknown kind', () => {
    const bad = JSON.stringify({ kind: 'banana', ts: 1, payload: {} });
    expect(() => decodeRecord(bad)).toThrow();
  });
});
