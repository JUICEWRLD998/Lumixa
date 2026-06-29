import { createRequire } from 'node:module';
import type * as NodeSqlite from 'node:sqlite';
import type { Decision } from '@lumixa/core';

type DatabaseSyncType = NodeSqlite.DatabaseSync;
type SQLInputValue = NodeSqlite.SQLInputValue;

// `node:sqlite` is a recent Node builtin that bundlers (Vite/vitest) don't yet
// auto-externalize — a static `import` gets rewritten to a bare `sqlite` specifier
// and fails to resolve. Loading it through `createRequire` keeps it a genuine
// runtime builtin lookup; the type-only namespace import above is erased at compile time.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof NodeSqlite;

/**
 * Status of the on-chain SCORE/result validation for a decision. The odds-tick
 * proof is verified client-side (see `Prover.verify`), but settling the result
 * against the day's score Merkle root needs the Txoracle `validateStat .view()`,
 * which is blocked on the undocumented program id/IDL — so it is reported
 * honestly as `pending-idl` rather than faked.
 */
export type ScoreValidation = 'pending-idl' | 'verified' | 'failed';

/**
 * A row of the Lumixa ledger: a {@link Decision} plus the Prove-stage metadata
 * (narration, when it was re-verified, and the score-validation status). The
 * append-only ledger of these rows is the agent's un-fakeable reputation.
 */
export interface LedgerRow extends Decision {
  /** best-effort human-readable rationale (narration layer; cosmetic) */
  narration?: string;
  /** ms timestamp of the last successful `verify` (independent re-check) */
  verifiedAt?: number;
  /** on-chain score/result validation status */
  scoreValidation?: ScoreValidation;
}

/**
 * Persistence boundary for the ledger. Keeping this an interface makes the
 * documented SQLite→Postgres swap (`implementation.md` §2) a drop-in: callers
 * depend only on these five operations, never on `better-sqlite3`.
 */
export interface LedgerRepository {
  /** Insert or replace a row by `id`. */
  upsert(row: LedgerRow): void;
  /** Fetch one row by id, or `undefined`. */
  get(id: string): LedgerRow | undefined;
  /** All rows, in insertion order. */
  list(): LedgerRow[];
  /** Attach a narration string to a row. */
  setNarration(id: string, narration: string): void;
  /** Record proof anchoring (proof reference + devnet/offline tx signature). */
  setProof(id: string, fields: { proofRef?: string; txSig?: string }): void;
  /** Record the result of a `verify` pass. */
  setVerified(
    id: string,
    fields: { verifiedAt: number; scoreValidation: ScoreValidation; clv?: number; brier?: number },
  ): void;
}

/** In-memory ledger — used for tests, the offline path, and ephemeral demos. */
export class InMemoryLedger implements LedgerRepository {
  private readonly rows = new Map<string, LedgerRow>();

  upsert(row: LedgerRow): void {
    this.rows.set(row.id, { ...row });
  }
  get(id: string): LedgerRow | undefined {
    const row = this.rows.get(id);
    return row ? { ...row } : undefined;
  }
  list(): LedgerRow[] {
    return [...this.rows.values()].map((r) => ({ ...r }));
  }
  setNarration(id: string, narration: string): void {
    this.patch(id, { narration });
  }
  setProof(id: string, fields: { proofRef?: string; txSig?: string }): void {
    this.patch(id, fields);
  }
  setVerified(
    id: string,
    fields: { verifiedAt: number; scoreValidation: ScoreValidation; clv?: number; brier?: number },
  ): void {
    this.patch(id, fields);
  }
  private patch(id: string, fields: Partial<LedgerRow>): void {
    const row = this.rows.get(id);
    if (row) this.rows.set(id, { ...row, ...fields });
  }
}

/** Columns persisted to SQLite, in declaration order. */
const COLUMNS = [
  'id',
  'messageId',
  'fixtureId',
  'market',
  'side',
  'price',
  'entryPct',
  'ourTs',
  'leaderBook',
  'stake',
  'status',
  'proofRef',
  'txSig',
  'closingPct',
  'clv',
  'brier',
  'narration',
  'verifiedAt',
  'scoreValidation',
] as const;

/**
 * SQLite-backed ledger on the Node 22+ built-in `node:sqlite` (`DatabaseSync`).
 * Synchronous — fits the deterministic, timer-free style of the rest of the
 * agent — and an embedded file, so judges need no DB to provision and no native
 * toolchain to compile a driver. Pass `':memory:'` for an ephemeral instance.
 */
export class SqliteLedger implements LedgerRepository {
  private readonly db: DatabaseSyncType;

  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path);
    // WAL gives crash-safe append semantics for the on-disk ledger; harmless for ':memory:'.
    if (path !== ':memory:') this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS decisions (
        id TEXT PRIMARY KEY,
        messageId TEXT NOT NULL,
        fixtureId INTEGER NOT NULL,
        market TEXT NOT NULL,
        side TEXT NOT NULL,
        price REAL NOT NULL,
        entryPct REAL NOT NULL,
        ourTs INTEGER NOT NULL,
        leaderBook INTEGER NOT NULL,
        stake REAL NOT NULL,
        status TEXT NOT NULL,
        proofRef TEXT,
        txSig TEXT,
        closingPct REAL,
        clv REAL,
        brier REAL,
        narration TEXT,
        verifiedAt INTEGER,
        scoreValidation TEXT,
        seq INTEGER
      );
    `);
  }

  /** Close the underlying database handle. */
  close(): void {
    this.db.close();
  }

  upsert(row: LedgerRow): void {
    const placeholders = COLUMNS.map((c) => `@${c}`).join(', ');
    const updates = COLUMNS.filter((c) => c !== 'id')
      .map((c) => `${c} = excluded.${c}`)
      .join(', ');
    // `seq` orders rows by first insertion so `list()` is stable across updates.
    const stmt = this.db.prepare(`
      INSERT INTO decisions (${COLUMNS.join(', ')}, seq)
      VALUES (${placeholders}, (SELECT COALESCE(MAX(seq), 0) + 1 FROM decisions))
      ON CONFLICT(id) DO UPDATE SET ${updates}
    `);
    stmt.run(this.toParams(row));
  }

  /** Map a row to `@`-prefixed bound params, coercing `undefined` → `null`. */
  private toParams(row: LedgerRow): Record<string, SQLInputValue> {
    const params: Record<string, SQLInputValue> = {};
    for (const col of COLUMNS) {
      const value = (row as unknown as Record<string, unknown>)[col];
      params[`@${col}`] = (value === undefined ? null : value) as SQLInputValue;
    }
    return params;
  }

  get(id: string): LedgerRow | undefined {
    const raw = this.db.prepare(`SELECT * FROM decisions WHERE id = ?`).get(id);
    return raw ? this.fromRow(raw as Record<string, unknown>) : undefined;
  }

  list(): LedgerRow[] {
    const rows = this.db.prepare(`SELECT * FROM decisions ORDER BY seq ASC`).all();
    return (rows as Record<string, unknown>[]).map((r) => this.fromRow(r));
  }

  setNarration(id: string, narration: string): void {
    this.db.prepare(`UPDATE decisions SET narration = ? WHERE id = ?`).run(narration, id);
  }

  setProof(id: string, fields: { proofRef?: string; txSig?: string }): void {
    this.db
      .prepare(`UPDATE decisions SET proofRef = COALESCE(?, proofRef), txSig = COALESCE(?, txSig) WHERE id = ?`)
      .run(fields.proofRef ?? null, fields.txSig ?? null, id);
  }

  setVerified(
    id: string,
    fields: { verifiedAt: number; scoreValidation: ScoreValidation; clv?: number; brier?: number },
  ): void {
    this.db
      .prepare(
        `UPDATE decisions SET verifiedAt = ?, scoreValidation = ?,
           clv = COALESCE(?, clv), brier = COALESCE(?, brier) WHERE id = ?`,
      )
      .run(fields.verifiedAt, fields.scoreValidation, fields.clv ?? null, fields.brier ?? null, id);
  }

  /** Rebuild a {@link LedgerRow} from a DB row, dropping `null`s back to absent. */
  private fromRow(raw: Record<string, unknown>): LedgerRow {
    const row: Record<string, unknown> = {};
    for (const col of COLUMNS) {
      if (raw[col] !== null && raw[col] !== undefined) row[col] = raw[col];
    }
    return row as unknown as LedgerRow;
  }
}
