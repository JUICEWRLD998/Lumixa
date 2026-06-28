import { PublicKey } from '@solana/web3.js';
import type { Connection } from '@solana/web3.js';

/** Milliseconds in one UTC day — the epoch-day bucket size for score roots. */
export const MS_PER_DAY = 86_400_000;

/** First seed for the daily-scores Merkle-roots PDA (an ASCII byte string). */
export const DAILY_SCORES_ROOTS_SEED = 'daily_scores_roots';

/**
 * Compute the UTC epoch-day index for a timestamp: `floor(ts / 86_400_000)`.
 * This is the integer that gets encoded as the u16 PDA seed.
 *
 * @param ts timestamp in milliseconds since the Unix epoch
 */
export function epochDay(ts: number): number {
  return Math.floor(ts / MS_PER_DAY);
}

/**
 * Derive the `daily_scores_roots` PDA that stores the Merkle roots of score
 * stats for a given UTC day, under the Txoracle program.
 *
 * Seeds (in order):
 *   1. `"daily_scores_roots"` (ASCII bytes)
 *   2. the epoch day as a 2-byte little-endian `u16`
 *
 * The epoch day is `floor(ts / 86_400_000)`. This derivation is fully
 * specified and implemented here for real — it does not depend on the (still
 * undocumented) Txoracle program id beyond receiving it as a parameter.
 *
 * @param programId the Txoracle program id (caller supplies it)
 * @param ts        timestamp in milliseconds; bucketed to its UTC day
 * @returns `[pda, bump]` as returned by `PublicKey.findProgramAddressSync`
 * @throws if the epoch day does not fit in a u16 (outside ~year 1970–2149)
 */
export function deriveDailyScoresRootsPda(programId: PublicKey, ts: number): [PublicKey, number] {
  const day = epochDay(ts);
  if (!Number.isInteger(day) || day < 0 || day > 0xffff) {
    throw new Error(`deriveDailyScoresRootsPda: epochDay ${day} out of u16 range for ts ${ts}`);
  }

  // Encode epochDay as a little-endian u16 (2 bytes): e.g. 19884 -> [0xAC, 0x4D].
  const epochDayLe = Buffer.alloc(2);
  epochDayLe.writeUInt16LE(day, 0);

  return PublicKey.findProgramAddressSync(
    [Buffer.from(DAILY_SCORES_ROOTS_SEED, 'utf8'), epochDayLe],
    programId,
  );
}

/** Inputs for {@link validateStat}. */
export interface ValidateStatParams {
  /** live devnet connection (Txoracle API base: https://txline-dev.txodds.com/api/) */
  connection: Connection;
  /** the Txoracle program id (see `TODO(phase3)`) */
  programId: PublicKey;
  /** timestamp (ms) of the stat being verified; selects the PDA's epoch day */
  ts: number;
}

/**
 * On-chain verification of a score stat against the day's Merkle root via the
 * Txoracle program's `validateStat` view.
 *
 * The intended call shape (from the domain reference):
 * ```ts
 * program.methods
 *   .validateStat(...leafAndProofArgs)
 *   .accounts({ dailyScoresMerkleRoots: pda })
 *   .preInstructions([
 *     ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
 *   ])
 *   .view(); // -> boolean
 * ```
 *
 * The PDA derivation ({@link deriveDailyScoresRootsPda}) is real and ready.
 * The actual program call is Phase 3 work: the Txoracle program id, its IDL,
 * and the `validateStat` argument list are not in our docs. We deliberately do
 * NOT fabricate a program address — the caller must pass a real `programId`,
 * and the method call below stays a marked stub until the IDL is available.
 *
 * @throws always, until the Txoracle program/IDL is wired (see `TODO(phase3)`)
 */
export async function validateStat(params: ValidateStatParams): Promise<boolean> {
  const { connection, programId, ts } = params;

  // Real, ready-to-use: derive the PDA the program call will read.
  const [pda, bump] = deriveDailyScoresRootsPda(programId, ts);

  // TODO(phase3): load the Txoracle IDL + program id, build an anchor Program,
  // and invoke:
  //   const program = new Program(IDL, programId, new AnchorProvider(connection, wallet, {}));
  //   return await program.methods
  //     .validateStat(/* leaf, proof, index, ... */)
  //     .accounts({ dailyScoresMerkleRoots: pda })
  //     .preInstructions([
  //       ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
  //     ])
  //     .view();
  void connection;
  void pda;
  void bump;

  throw new Error(
    'validateStat: not yet wired — needs the Txoracle program id + IDL (Phase 3). ' +
      'PDA derivation is implemented; the on-chain view call is a marked stub.',
  );
}
