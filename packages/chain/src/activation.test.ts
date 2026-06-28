import { describe, it, expect } from 'vitest';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { Keypair } from '@solana/web3.js';
import { buildActivationMessage, signActivation } from './activation.js';

/**
 * Fixed 32-byte ed25519 seed -> deterministic keypair. We derive via
 * `Keypair.fromSeed` (deterministic) instead of `Keypair.generate` so the
 * secret/public correspondence is guaranteed and the test is reproducible
 * without embedding an unverifiable 64-byte literal.
 */
const SEED = new Uint8Array(32);
for (let i = 0; i < SEED.length; i += 1) SEED[i] = i + 1;
const WALLET = Keypair.fromSeed(SEED);

const TX_SIG = '5xKqz3exampleSubscribeTxSignatureBase58';
const LEAGUES = 'worldcup';
const JWT = 'header.payload.signature';

describe('buildActivationMessage', () => {
  it('formats `${txSig}:${leagues}:${jwt}` exactly', () => {
    expect(buildActivationMessage(TX_SIG, LEAGUES, JWT)).toBe(`${TX_SIG}:${LEAGUES}:${JWT}`);
  });

  it('is just colon-joined with no extra escaping', () => {
    expect(buildActivationMessage('a', 'b', 'c')).toBe('a:b:c');
  });
});

describe('signActivation', () => {
  it('returns a base58 string that round-trips to a 64-byte signature', () => {
    const sig = signActivation(WALLET, TX_SIG, LEAGUES, JWT);
    expect(typeof sig).toBe('string');
    const raw = bs58.decode(sig);
    expect(raw.length).toBe(nacl.sign.signatureLength);
  });

  it('produces a signature that verifies against the wallet public key', () => {
    const sig = signActivation(WALLET, TX_SIG, LEAGUES, JWT);
    const message = new TextEncoder().encode(buildActivationMessage(TX_SIG, LEAGUES, JWT));
    const ok = nacl.sign.detached.verify(message, bs58.decode(sig), WALLET.publicKey.toBytes());
    expect(ok).toBe(true);
  });

  it('does NOT verify against a different message (tamper check)', () => {
    const sig = signActivation(WALLET, TX_SIG, LEAGUES, JWT);
    const tampered = new TextEncoder().encode(buildActivationMessage(TX_SIG, 'premierleague', JWT));
    const ok = nacl.sign.detached.verify(tampered, bs58.decode(sig), WALLET.publicKey.toBytes());
    expect(ok).toBe(false);
  });

  it('is deterministic for the same inputs (ed25519 detached)', () => {
    const a = signActivation(WALLET, TX_SIG, LEAGUES, JWT);
    const b = signActivation(WALLET, TX_SIG, LEAGUES, JWT);
    expect(a).toBe(b);
  });
});
