/**
 * Pure grading math for the PROVE stage — kept dependency-free so the Phase-3
 * `prover` reuses it verbatim against Merkle-proven closing lines + results.
 *
 * Both inputs are demargined fair probabilities in PERCENT (the units of `Pct`).
 */

/**
 * Closing Line Value for a BACKED outcome, as a probability fraction:
 * `(closingPct − entryPct) / 100`.
 *
 * Positive ⇒ the consensus fair line moved TOWARD our outcome after we entered,
 * i.e. we secured a better-than-closing price — the academically established
 * signature of genuine betting skill, and Phase 2's exit gate.
 */
export function clv(entryPct: number, closingPct: number): number {
  return (closingPct - entryPct) / 100;
}

/**
 * Brier score component for one decision: `(p − outcome)²`, where `p` is our
 * entry probability (fraction) and `outcome` is 1 if the backed side won, else
 * 0. Lower is better-calibrated.
 */
export function brier(entryPct: number, won: boolean): number {
  const p = entryPct / 100;
  return (p - (won ? 1 : 0)) ** 2;
}
