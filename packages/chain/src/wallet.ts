import bs58 from 'bs58';
import { Keypair } from '@solana/web3.js';

/**
 * Size (in bytes) of an ed25519 secret key as stored by Solana — 32 bytes of
 * seed concatenated with the 32-byte public key. `Keypair.fromSecretKey`
 * expects exactly this length.
 */
export const SECRET_KEY_LENGTH = 64;

/**
 * Decode a base58-encoded ed25519 secret key (the `WALLET_SECRET` env value)
 * into a Solana {@link Keypair}.
 *
 * The secret is the full 64-byte secret key (seed + public key), base58
 * encoded — the format `solana-keygen`/Phantom export and what we feed back
 * into the signer. We validate the decoded length up front so a malformed or
 * truncated secret fails loudly here instead of deep inside web3.js.
 *
 * @param secretBase58 base58 string of the 64-byte secret key
 * @throws if the string is empty, not valid base58, or not 64 bytes
 */
export function loadWallet(secretBase58: string): Keypair {
  if (!secretBase58 || secretBase58.trim().length === 0) {
    throw new Error('loadWallet: empty WALLET_SECRET — expected base58 secret key');
  }

  let decoded: Uint8Array;
  try {
    decoded = bs58.decode(secretBase58.trim());
  } catch (cause) {
    throw new Error('loadWallet: WALLET_SECRET is not valid base58', { cause });
  }

  if (decoded.length !== SECRET_KEY_LENGTH) {
    throw new Error(
      `loadWallet: decoded secret key is ${decoded.length} bytes, expected ${SECRET_KEY_LENGTH}`,
    );
  }

  return Keypair.fromSecretKey(decoded);
}

/** Return the wallet's public key as a base58 string (its on-chain address). */
export function walletPublicKey(wallet: Keypair): string {
  return wallet.publicKey.toBase58();
}
