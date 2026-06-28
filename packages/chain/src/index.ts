/**
 * @lumixa/chain — the Solana devnet layer for on-chain subscription and
 * activation signing.
 *
 * Public surface:
 *  - wallet:       load a devnet `Keypair` from a base58 secret, read its pubkey
 *  - connection:   open a JSON-RPC `Connection` to the cluster
 *  - activation:   build + ed25519-sign the `/api/token/activate` message (REAL)
 *  - subscribe:    Token-2022 `subscribe` scaffold (instruction is `TODO(confirm)`)
 *  - validate-stat: derive the `daily_scores_roots` PDA (REAL) + `validateStat`
 *                   Txoracle view wrapper (`TODO(phase3)`)
 *
 * Whats real and tested: activation message + signature, and the PDA
 * derivation. Whats stubbed: the on-chain `subscribe` instruction and the
 * Txoracle `validateStat` call, both pending the undocumented program id/IDL.
 */
export { loadWallet, walletPublicKey, SECRET_KEY_LENGTH } from './wallet.js';
export { getConnection } from './connection.js';
export { signActivation, buildActivationMessage } from './activation.js';
export { subscribeOnChain } from './subscribe.js';
export type { SubscribeParams, SubscribeResult } from './subscribe.js';
export {
  deriveDailyScoresRootsPda,
  epochDay,
  validateStat,
  MS_PER_DAY,
  DAILY_SCORES_ROOTS_SEED,
} from './validate-stat.js';
export type { ValidateStatParams } from './validate-stat.js';
