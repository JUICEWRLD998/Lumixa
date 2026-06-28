/**
 * @lumixa/core — shared types, normalized event model, and config.
 *
 * The single contract every other package compiles against:
 *  - odds:     raw `OddsPayload` ⇒ normalized `OddsTick`
 *  - scores:   raw score payload ⇒ normalized `ScoreEvent`
 *  - decision: `Decision` ledger row (Sense → Act → Prove)
 *  - record:   `RecordEnvelope` JSONL format for the replay corpus
 *  - config:   `Config` parsed from the environment
 */
export * from './odds.js';
export * from './scores.js';
export * from './decision.js';
export * from './record.js';
export * from './config.js';
