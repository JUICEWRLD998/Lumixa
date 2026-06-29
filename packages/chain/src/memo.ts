import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import type { Connection, Keypair } from '@solana/web3.js';

/**
 * SPL Memo anchoring — the REAL on-chain leg of the PROVE stage.
 *
 * We write each decision's hash into a Solana devnet transaction via the SPL
 * Memo program. This is genuinely on-chain and publicly inspectable (Explorer
 * shows the memo), so a decision's hash is timestamped + immutable the moment
 * the agent acts — exactly the "anchor the decision hash" requirement, with no
 * fabrication and no undocumented program needed (unlike `validateStat` /
 * `subscribe`, which stay honest stubs pending the Txoracle IDL).
 */

/** Canonical SPL Memo program id (same on mainnet + devnet). */
export const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

/**
 * Build a Memo instruction carrying `memo` (UTF-8), attributed to `payer` as a
 * signer so the memo is provably authored by our wallet.
 */
export function buildMemoInstruction(payer: PublicKey, memo: string): TransactionInstruction {
  return new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: [{ pubkey: payer, isSigner: true, isWritable: false }],
    data: Buffer.from(memo, 'utf8'),
  });
}

/** Inputs for {@link anchorMemo}. */
export interface AnchorMemoParams {
  /** live devnet connection (see `getConnection`) */
  connection: Connection;
  /** wallet that pays for + signs the anchoring tx (must be funded on devnet) */
  wallet: Keypair;
  /** the string to anchor — for Lumixa, a decision hash (see `@lumixa/prover`) */
  memo: string;
}

/** Result of a successful anchor — the confirmed devnet transaction signature. */
export interface AnchorMemoResult {
  /** base58 transaction signature; resolvable on Solana Explorer (devnet) */
  txSig: string;
}

/**
 * Anchor `memo` on devnet via the SPL Memo program and return the confirmed
 * transaction signature. Real network call — the caller decides when to invoke
 * it (Lumixa gates this behind `LUMIXA_ANCHOR=live` + a funded `WALLET_SECRET`;
 * the default offline path never calls this).
 */
export async function anchorMemo(params: AnchorMemoParams): Promise<AnchorMemoResult> {
  const { connection, wallet, memo } = params;
  const tx = new Transaction().add(buildMemoInstruction(wallet.publicKey, memo));
  const txSig = await sendAndConfirmTransaction(connection, tx, [wallet]);
  return { txSig };
}

/**
 * Read an anchored memo back from a confirmed transaction — used to confirm an
 * anchor independently (`memoConfirmed` in the verify path). The Memo program
 * logs its payload as `Program log: Memo (lenN): "<memo>"`; we pull the quoted
 * content out of the transaction's log messages.
 *
 * @returns the memo string, or `undefined` if the tx is missing / has no memo
 */
export async function fetchMemo(connection: Connection, txSig: string): Promise<string | undefined> {
  const tx = await connection.getTransaction(txSig, { maxSupportedTransactionVersion: 0 });
  const logs = tx?.meta?.logMessages;
  if (!logs) return undefined;
  for (const line of logs) {
    const match = /Program log: Memo \(len \d+\): "(.*)"$/.exec(line);
    if (match) return match[1];
  }
  return undefined;
}
