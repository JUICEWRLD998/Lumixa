import { describe, it, expect } from 'vitest';
import { Keypair, PublicKey } from '@solana/web3.js';
import { MEMO_PROGRAM_ID, buildMemoInstruction } from './memo.js';

describe('MEMO_PROGRAM_ID', () => {
  it('is the canonical SPL Memo program id', () => {
    expect(MEMO_PROGRAM_ID.toBase58()).toBe('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
  });
});

describe('buildMemoInstruction', () => {
  const payer = Keypair.generate().publicKey;

  it('targets the Memo program and carries the UTF-8 payload as data', () => {
    const memo = 'lumixa:' + 'a'.repeat(64);
    const ix = buildMemoInstruction(payer, memo);
    expect(ix.programId.equals(MEMO_PROGRAM_ID)).toBe(true);
    expect(ix.data.toString('utf8')).toBe(memo);
  });

  it('attributes the memo to the payer as a non-writable signer', () => {
    const ix = buildMemoInstruction(payer, 'hello');
    expect(ix.keys).toHaveLength(1);
    const [key] = ix.keys;
    expect((key?.pubkey as PublicKey).equals(payer)).toBe(true);
    expect(key?.isSigner).toBe(true);
    expect(key?.isWritable).toBe(false);
  });
});
