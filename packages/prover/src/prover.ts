import { anchorMemo, fetchMemo, verifyMerkleProof, type MerkleNode } from '@lumixa/chain';
import type { Connection, Keypair } from '@solana/web3.js';
import type { Decision } from '@lumixa/core';
import { hashDecision } from './hash.js';
import type { LedgerRepository } from './ledger.js';
import type { Narrator } from './narrate.js';

/** Sentinel prefix for an offline (un-anchored) decision: `offline:<hash>`. */
export const OFFLINE_TXSIG_PREFIX = 'offline:';

/**
 * A normalized odds Merkle proof — what the verifier needs, extracted from the
 * (undocumented) TxLINE proof bundle by {@link parseOddsMerkleProof}.
 */
export interface OddsMerkleProof {
  /** hex sha256 of the proven odds-tick leaf */
  leaf: string;
  /** sibling steps, leaf→root */
  nodes: MerkleNode[];
  /** hex sha256 of the published root */
  root: string;
}

/** Fetch + normalize the odds Merkle proof for a `messageId` (e.g. via ingest). */
export type ProofFetcher = (messageId: string) => Promise<OddsMerkleProof | undefined>;

/** Outcome of an independent re-verification of a decision. */
export interface VerifyResult {
  decisionId: string;
  /** the recomputed decision hash (anchored value) */
  hash: string;
  /** did the odds-tick Merkle proof verify against its published root? */
  merkleVerified: boolean;
  /** did the anchored memo (on-chain, or the offline sentinel) match the hash? */
  memoConfirmed: boolean;
  /** anchoring signature: a real devnet sig, or `offline:<hash>` */
  txSig?: string;
  /** Solana Explorer link — only for a real (live) signature */
  explorerUrl?: string;
  clv?: number;
  brier?: number;
  /** score/result validation — blocked on the Txoracle IDL (honest) */
  scoreValidation: 'pending-idl';
}

/** Construction options for {@link Prover}. */
export interface ProverOptions {
  ledger: LedgerRepository;
  /** `'offline'` (default) computes a deterministic sentinel sig; `'live'` anchors on devnet. */
  mode?: 'offline' | 'live';
  /** fetches odds Merkle proofs for `verify` (injected; e.g. wraps the ingest client) */
  proofFetcher?: ProofFetcher;
  /** best-effort narration (cosmetic; never on the decision path) */
  narrator?: Narrator;
  /** devnet connection — required for `mode: 'live'` */
  connection?: Connection;
  /** funded wallet — required for `mode: 'live'` */
  wallet?: Keypair;
  /** cluster name for Explorer links (default `'devnet'`) */
  cluster?: string;
}

/** Build a Solana Explorer URL for a tx signature. */
function explorerUrl(txSig: string, cluster: string): string {
  return `https://explorer.solana.com/tx/${txSig}?cluster=${cluster}`;
}

/** True for the offline sentinel signature shape. */
function isOfflineSig(txSig: string | undefined): boolean {
  return txSig?.startsWith(OFFLINE_TXSIG_PREFIX) ?? false;
}

/**
 * Tolerantly extract a {@link OddsMerkleProof} from the raw (undocumented)
 * TxLINE proof bundle. We probe a few plausible field spellings and bail to
 * `undefined` if the shape isn't recognized — never guessing a root.
 */
export function parseOddsMerkleProof(raw: unknown): OddsMerkleProof | undefined {
  if (raw === null || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const leaf = pickString(obj, 'leaf', 'leafHash', 'statToProve', 'hash');
  const root = pickString(obj, 'root', 'eventStatRoot', 'merkleRoot');
  const rawNodes = obj.nodes ?? obj.proof ?? obj.statProof ?? obj.subTreeProof;
  if (leaf === undefined || root === undefined || !Array.isArray(rawNodes)) return undefined;

  const nodes: MerkleNode[] = [];
  for (const n of rawNodes) {
    if (n === null || typeof n !== 'object') return undefined;
    const node = n as Record<string, unknown>;
    const hash = pickString(node, 'hash', 'sibling', 'siblingHash');
    if (hash === undefined) return undefined;
    nodes.push({ hash, isRightSibling: Boolean(node.isRightSibling ?? node.right) });
  }
  return { leaf, nodes, root };
}

function pickString(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

/**
 * The PROVE orchestrator. Anchors each decision's hash (real devnet Memo in
 * `live` mode, a deterministic `offline:<hash>` sentinel otherwise), records it
 * in the Lumixa ledger, and independently re-verifies it on demand:
 *  - recompute the decision hash from the immutable facts;
 *  - fetch + client-side verify the odds-tick Merkle proof against its root;
 *  - confirm the anchored memo matches the hash;
 *  - surface CLV/Brier; score/result validation is honestly `pending-idl`.
 */
export class Prover {
  private readonly ledger: LedgerRepository;
  private readonly mode: 'offline' | 'live';
  private readonly proofFetcher?: ProofFetcher;
  private readonly narrator?: Narrator;
  private readonly connection?: Connection;
  private readonly wallet?: Keypair;
  private readonly cluster: string;

  constructor(opts: ProverOptions) {
    this.ledger = opts.ledger;
    this.mode = opts.mode ?? 'offline';
    this.proofFetcher = opts.proofFetcher;
    this.narrator = opts.narrator;
    this.connection = opts.connection;
    this.wallet = opts.wallet;
    this.cluster = opts.cluster ?? 'devnet';
    if (this.mode === 'live' && (!this.connection || !this.wallet)) {
      throw new Error("Prover: mode 'live' requires both a connection and a funded wallet");
    }
  }

  /**
   * Anchor a decision's hash and persist the row. In `live` mode this sends a
   * real SPL-Memo transaction on devnet; offline it stores the deterministic
   * `offline:<hash>` sentinel (never a fabricated base58 signature). Returns the
   * `txSig` written to the ledger.
   */
  async anchor(decision: Decision): Promise<string> {
    const hash = hashDecision(decision);
    this.ledger.upsert(decision);

    let txSig: string;
    if (this.mode === 'live' && this.connection && this.wallet) {
      const res = await anchorMemo({ connection: this.connection, wallet: this.wallet, memo: hash });
      txSig = res.txSig;
    } else {
      txSig = `${OFFLINE_TXSIG_PREFIX}${hash}`;
    }
    this.ledger.setProof(decision.id, { proofRef: hash, txSig });

    if (this.narrator) {
      const text = await this.narrator(decision);
      if (text) this.ledger.setNarration(decision.id, text);
    }
    return txSig;
  }

  /**
   * Independently re-verify an anchored decision. Pass `now` (ms) for the
   * `verifiedAt` stamp — the caller supplies it so the prover stays free of
   * wall-clock reads (deterministic under replay).
   */
  async verify(decisionId: string, now: number): Promise<VerifyResult> {
    const row = this.ledger.get(decisionId);
    if (!row) throw new Error(`verify: unknown decision ${decisionId}`);

    const hash = hashDecision(row);

    // Odds-tick Merkle proof — verified client-side against its published root.
    let merkleVerified = false;
    if (this.proofFetcher) {
      const proof = await this.proofFetcher(row.messageId);
      if (proof) merkleVerified = verifyMerkleProof(proof.leaf, proof.nodes, proof.root);
    }

    // Anchor confirmation: read the memo back on-chain (live) or match the
    // offline sentinel (offline) against the freshly recomputed hash.
    let memoConfirmed = false;
    if (isOfflineSig(row.txSig)) {
      memoConfirmed = row.txSig === `${OFFLINE_TXSIG_PREFIX}${hash}`;
    } else if (row.txSig && this.connection) {
      const memo = await fetchMemo(this.connection, row.txSig);
      memoConfirmed = memo === hash;
    }

    const scoreValidation = 'pending-idl' as const;
    this.ledger.setVerified(decisionId, { verifiedAt: now, scoreValidation, clv: row.clv, brier: row.brier });

    return {
      decisionId,
      hash,
      merkleVerified,
      memoConfirmed,
      txSig: row.txSig,
      explorerUrl: row.txSig && !isOfflineSig(row.txSig) ? explorerUrl(row.txSig, this.cluster) : undefined,
      clv: row.clv,
      brier: row.brier,
      scoreValidation,
    };
  }
}
