/** Lifecycle of a trading decision through the Sense → Act → Prove loop. */
export type DecisionStatus =
  | 'open' // entered, not yet settled
  | 'settled' // closing line + result known, CLV/Brier computed
  | 'verified'; // re-verified on devnet via `validateStat .view()`

/**
 * One autonomous decision the agent made — the atomic row of the Lumixa
 * ledger. The decision hash is anchored on devnet; `clv`/`brier` are filled at
 * the Prove stage and graded against the Merkle-proven closing line + result.
 */
export interface Decision {
  /** stable decision id (ledger primary key) */
  id: string;
  /** `MessageId` of the odds tick acted on — links to the anchored proof */
  messageId: string;
  fixtureId: number;
  /** market type, e.g. `"1X2"` */
  market: string;
  /** outcome we took, e.g. `"Home"` (one of the tick's `priceNames`) */
  side: string;
  /** decimal entry price, e.g. `1.90` */
  price: number;
  /** demargined fair probability at entry, percent */
  entryPct: number;
  /** our decision timestamp (ms) */
  ourTs: number;
  /** `BookmakerId` of the price-discovery leader that triggered the signal */
  leaderBook: number;
  /** stake (paper / devnet book units) */
  stake: number;
  status: DecisionStatus;

  // ── proof + anchoring ──────────────────────────────────────────
  /** reference to the odds Merkle proof for the acted-on tick */
  proofRef?: string;
  /** devnet transaction signature anchoring the decision hash */
  txSig?: string;

  // ── grading (Prove) ────────────────────────────────────────────
  /** demargined fair probability at close, percent */
  closingPct?: number;
  /**
   * Closing Line Value (fraction): `(closingPct − entryPct) / 100` for the
   * backed side. Positive ⇒ the line moved our way → a better-than-closing
   * price. See `@lumixa/engine`'s `clv()` for the canonical computation.
   */
  clv?: number;
  /** Brier score component for this decision */
  brier?: number;
}
