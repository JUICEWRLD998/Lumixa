import { Transaction } from '@solana/web3.js';
import type { Connection, Keypair } from '@solana/web3.js';

/** Inputs for {@link subscribeOnChain}. Mirrors the relevant `Config` fields. */
export interface SubscribeParams {
  /** live devnet connection (see {@link getConnection}) */
  connection: Connection;
  /** subscriber wallet that pays for and signs the subscribe tx */
  wallet: Keypair;
  /** service level being purchased (`Config.serviceLevelId`) */
  serviceLevelId: number;
  /** subscription duration in weeks (`Config.durationWeeks`) */
  durationWeeks: number;
  /** comma/single league selection string (`Config.selectedLeagues`) */
  selectedLeagues: string;
}

/** Result of a successful on-chain subscribe — the transaction signature. */
export interface SubscribeResult {
  /** base58 transaction signature, used as input to {@link signActivation} */
  txSig: string;
}

/**
 * Submit the Token-2022 `subscribe(serviceLevelId, durationWeeks,
 * selectedLeagues)` instruction on devnet and return its transaction
 * signature.
 *
 * The signature this returns is the `txSig` that flows into
 * {@link signActivation} to build the `walletSignature` for
 * `/api/token/activate`.
 *
 * HONESTY: the exact Token-2022 subscribe program id and account layout are
 * not in our docs yet (Phase 3 work). The connection, wallet, transaction
 * scaffold, and downstream activation-signing are real and correct, but the
 * actual instruction cannot be constructed without the program id/IDL. Rather
 * than fabricate a program address and return a fake signature, this throws a
 * clear "not yet wired" error. Wire the real instruction at the marker below,
 * build/sign/send the transaction, and return the confirmed signature.
 *
 * @throws always, until the subscribe instruction is wired (see `TODO(confirm)`)
 */
export async function subscribeOnChain(params: SubscribeParams): Promise<SubscribeResult> {
  const { connection, wallet, serviceLevelId, durationWeeks, selectedLeagues } = params;

  // Scaffold the transaction we will populate once the program is known.
  // Constructed (not just declared) so the wiring point below is obvious and
  // the lint/type surface matches the real send path.
  const tx = new Transaction();
  tx.feePayer = wallet.publicKey;

  // TODO(confirm): construct and append the Token-2022 `subscribe` instruction.
  //   - needs the subscribe program id + IDL / account layout
  //   - args: serviceLevelId (u8/u16), durationWeeks (u16), selectedLeagues (string)
  //   - accounts: subscriber (wallet.publicKey, signer), mint, token account, etc.
  // Once wired:
  //   tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  //   const txSig = await sendAndConfirmTransaction(connection, tx, [wallet]);
  //   return { txSig };
  void connection;
  void serviceLevelId;
  void durationWeeks;
  void selectedLeagues;
  void tx;

  throw new Error(
    'subscribeOnChain: not yet wired — needs the Token-2022 subscribe program id/IDL (Phase 3). ' +
      'Refusing to return a fabricated transaction signature.',
  );
}
