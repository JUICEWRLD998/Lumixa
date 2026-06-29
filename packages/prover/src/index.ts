/**
 * @lumixa/prover — the PROVE layer + the Lumixa ledger.
 *
 * Turns graded {@link Decision}s into a persistent, independently verifiable
 * reputation:
 *  - hash:    canonical decision hash (anchored + re-derived) — `hashDecision`
 *  - ledger:  `LedgerRepository` + `SqliteLedger` / `InMemoryLedger`
 *  - prover:  `Prover` — anchor (real devnet Memo or offline sentinel) + verify
 *             (client-side odds Merkle proof + memo read-back + CLV/Brier)
 *  - narrate: best-effort OpenRouter→Gemini rationale (cosmetic, off-path)
 *
 * Score/result validation via the Txoracle `validateStat .view()` is blocked on
 * the undocumented program id/IDL and is reported honestly as `pending-idl`.
 */
export { hashDecision } from './hash.js';
export {
  InMemoryLedger,
  SqliteLedger,
  type LedgerRepository,
  type LedgerRow,
  type ScoreValidation,
} from './ledger.js';
export {
  Prover,
  parseOddsMerkleProof,
  OFFLINE_TXSIG_PREFIX,
  type ProverOptions,
  type ProofFetcher,
  type OddsMerkleProof,
  type VerifyResult,
} from './prover.js';
export { createNarrator, type Narrator, type CompletionFn, type NarrateConfig } from './narrate.js';
