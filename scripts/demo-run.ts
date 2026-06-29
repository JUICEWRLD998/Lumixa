/**
 * scripts/demo-run.ts — the Phase-3 end-to-end demo (and offline smoke test).
 *
 * Boots the real Lumixa API, drives the agent over a recorded corpus via
 * `POST /replay/start`, then reads the ledger and independently re-verifies a
 * decision through `GET /verify/:id` — exercising the SAME HTTP surface a judge
 * would hit. Runs fully offline and deterministically: an `InMemoryLedger`, an
 * offline `Prover` (sentinel signatures, never a fabricated tx sig), and a
 * synthetic odds-Merkle proof so the client-side verification path is real.
 *
 * Usage:
 *   pnpm demo                       # uses data/synthetic-777.jsonl
 *   pnpm demo --match data/foo.jsonl
 *
 * Exits non-zero if no decisions are produced or a verification fails the gate.
 */
import process from 'node:process';
import { sha256Hex } from '@lumixa/chain';
import {
  InMemoryLedger,
  Prover,
  oddsTickLeaf,
  type LedgerRow,
  type OddsMerkleProof,
  type ProofFetcher,
  type VerifyResult,
} from '@lumixa/prover';
import { Agent } from '@lumixa/server/agent';
import { buildServer } from '@lumixa/server/server';

interface ReplayResponse {
  started: boolean;
  events: number;
  decisions: number;
  settled: number;
}
interface LedgerResponse {
  count: number;
  decisions: LedgerRow[];
}

/** Fetch JSON and cast to the expected shape (Node's `fetch` types `.json()` as `unknown`). */
async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  return (await res.json()) as T;
}

/** Parse `--match` (defaults to the bundled synthetic corpus). */
function parseMatch(argv: string[]): string {
  const i = argv.indexOf('--match');
  if (i >= 0) {
    const v = argv[i + 1];
    if (v === undefined) throw new Error('--match requires a value');
    return v;
  }
  return 'data/synthetic-777.jsonl';
}

/**
 * A synthetic-but-honest odds Merkle proof: a real 2-leaf tree whose proven leaf
 * is exactly the one the decision commits to (`oddsTickLeaf(messageId)`). The
 * verifier folds it to the published root client-side — the same code path a real
 * TxLINE proof would take, just with a locally-constructed witness for the demo.
 */
const proofFetcher: ProofFetcher = async (messageId: string): Promise<OddsMerkleProof> => {
  const leaf = oddsTickLeaf(messageId);
  const sibling = sha256Hex(`sibling:${messageId}`);
  const root = sha256Hex(Buffer.concat([Buffer.from(leaf, 'hex'), Buffer.from(sibling, 'hex')]));
  return { leaf, nodes: [{ hash: sibling, isRightSibling: true }], root };
};

async function main(): Promise<void> {
  const match = parseMatch(process.argv.slice(2));

  // Deterministic clock so `verifiedAt` is reproducible across runs.
  let tick = 1_700_000_000_000;
  const now = (): number => (tick += 1);

  const ledger = new InMemoryLedger();
  const prover = new Prover({ ledger, proofFetcher });
  const agent = new Agent({ prover, ledger });
  const app = buildServer({ ledger, prover, agent, now });

  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (address === null || typeof address === 'string') throw new Error('failed to bind a port');
  const base = `http://127.0.0.1:${address.port}`;
  console.log(`\nLumixa API up on ${base} (offline mode)\n`);

  try {
    // 1) Drive the full SENSE→ACT→PROVE loop over the corpus.
    const replay = await getJson<ReplayResponse>(`${base}/replay/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ match }),
    });
    console.log(`POST /replay/start → ${JSON.stringify(replay)}`);
    if (!replay.started || replay.decisions === 0) {
      throw new Error('no decisions were produced — nothing to prove');
    }

    // 2) Read the append-only ledger.
    const ledgerResp = await getJson<LedgerResponse>(`${base}/ledger`);
    console.log(`\nGET /ledger → ${ledgerResp.count} decision(s):`);
    for (const d of ledgerResp.decisions) {
      const clvPp = typeof d.clv === 'number' ? (d.clv * 100).toFixed(2) : '—';
      console.log(
        `  ${d.id.slice(0, 22).padEnd(22)}  ${d.side.padEnd(5)}  ` +
          `CLV ${clvPp.padStart(7)}pp  status=${d.status}  txSig=${String(d.txSig)}`,
      );
    }

    // 3) Independently re-verify the first decision over HTTP — the exit gate.
    const first = ledgerResp.decisions[0];
    if (!first) throw new Error('ledger is empty after replay');
    const verify = await getJson<VerifyResult>(`${base}/verify/${first.id}`);
    console.log(`\nGET /verify/${first.id} →`);
    console.log(`  merkleVerified : ${verify.merkleVerified}`);
    console.log(`  memoConfirmed  : ${verify.memoConfirmed}`);
    console.log(`  scoreValidation: ${verify.scoreValidation}`);
    console.log(`  clv            : ${verify.clv}`);
    console.log(`  txSig          : ${verify.txSig}`);

    if (verify.merkleVerified !== true || verify.memoConfirmed !== true) {
      throw new Error('verification gate failed: expected merkleVerified && memoConfirmed');
    }
    console.log('\n✓ Phase-3 exit gate: a decision was anchored and independently re-verified.\n');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('\ndemo-run failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
