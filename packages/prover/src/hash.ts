import { sha256Hex } from '@lumixa/chain';
import type { Decision } from '@lumixa/core';

/**
 * Canonical hash of a {@link Decision} — the value anchored on-chain and
 * re-derived at verify time. We hash only the IMMUTABLE decision facts (what the
 * agent committed to at the moment it acted), never the grading fields that get
 * filled in later (`clv`, `closingPct`, `txSig`, `status`). Re-running this on a
 * settled decision therefore reproduces the exact hash that was anchored.
 *
 * The field set is fixed and written in a stable order, so the hash is
 * independent of the input object's property ordering — deterministic across
 * replay, restart, and serialization round-trips.
 */
export function hashDecision(decision: Decision): string {
  const canonical = JSON.stringify({
    messageId: decision.messageId,
    fixtureId: decision.fixtureId,
    market: decision.market,
    side: decision.side,
    price: decision.price,
    entryPct: decision.entryPct,
    ourTs: decision.ourTs,
    leaderBook: decision.leaderBook,
  });
  return sha256Hex(canonical);
}
