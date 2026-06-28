import bs58 from 'bs58';
import nacl from 'tweetnacl';
import type { Keypair } from '@solana/web3.js';

/**
 * Build the canonical activation message that gets signed by the subscriber's
 * wallet. The format is the exact string the `/api/token/activate` endpoint
 * expects to re-derive and verify:
 *
 * ```
 * `${txSig}:${leagues}:${jwt}`
 * ```
 *
 * Kept as a pure, separately-exported function so both the signer and the test
 * suite agree byte-for-byte on what is being signed.
 *
 * @param txSig   the subscribe transaction signature (base58)
 * @param leagues the selected leagues string (e.g. `"worldcup"`)
 * @param jwt     the TxLine session JWT being activated
 */
export function buildActivationMessage(txSig: string, leagues: string, jwt: string): string {
  return `${txSig}:${leagues}:${jwt}`;
}

/**
 * Produce the `walletSignature` proving the subscriber authorized activation.
 *
 * We sign the {@link buildActivationMessage} bytes with the wallet's ed25519
 * secret key using a detached signature (`nacl.sign.detached`), then base58
 * encode the 64-byte signature. This is the value the `@lumixa/ingest` package
 * POSTs to `/api/token/activate`; the server re-derives the same message and
 * verifies it against the wallet's public key.
 *
 * Pure with respect to the wallet + inputs (ed25519 detached signatures are
 * deterministic), so it is fully unit-testable.
 *
 * @param wallet  the subscriber keypair (holds the ed25519 secret key)
 * @param txSig   the subscribe transaction signature (base58)
 * @param leagues the selected leagues string
 * @param jwt     the TxLine session JWT being activated
 * @returns base58-encoded detached ed25519 signature
 */
export function signActivation(
  wallet: Keypair,
  txSig: string,
  leagues: string,
  jwt: string,
): string {
  const message = buildActivationMessage(txSig, leagues, jwt);
  const messageBytes = new TextEncoder().encode(message);
  const signature = nacl.sign.detached(messageBytes, wallet.secretKey);
  return bs58.encode(signature);
}
