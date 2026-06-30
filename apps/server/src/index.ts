import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import dotenv from 'dotenv';
import { loadConfig } from '@lumixa/core';

// Load `.env` from the repo root regardless of cwd. `pnpm --filter` runs this
// package with cwd=apps/server, so the default cwd lookup misses the root file;
// we walk up from this module until we find one (then fall back to cwd default).
// The directory that holds `.env`/`pnpm-workspace.yaml` is also the corpus root
// that `/replay/start` resolves repo-relative paths against.
let repoRoot = process.cwd();
for (let dir = dirname(fileURLToPath(import.meta.url)); ; ) {
  if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) repoRoot = dir;
  const candidate = resolve(dir, '.env');
  if (existsSync(candidate)) {
    dotenv.config({ path: candidate });
    repoRoot = dir;
    break;
  }
  const parent = dirname(dir);
  if (parent === dir) {
    dotenv.config(); // nothing found walking up — fall back to default cwd lookup
    break;
  }
  dir = parent;
}
import { getConnection, loadWallet } from '@lumixa/chain';
import { TxlineClient } from '@lumixa/ingest';
import { Prover, SqliteLedger, parseOddsMerkleProof, createNarrator, type ProofFetcher } from '@lumixa/prover';
import { Agent } from './agent.js';
import { buildServer } from './server.js';

/**
 * Lumixa backend entrypoint — the stateful, long-running agent + API process
 * (`implementation.md` §10). Offline by default; set `LUMIXA_ANCHOR=live` (with
 * a funded `WALLET_SECRET`) to anchor decision hashes on devnet for real.
 */
async function main(): Promise<void> {
  const cfg = loadConfig();
  const mode = process.env.LUMIXA_ANCHOR === 'live' ? 'live' : 'offline';
  // Resolve the ledger file against the repo root (cwd is apps/server under
  // pnpm) so it lands in the real `data/` dir; `:memory:` passes through.
  const dbEnv = process.env.LUMIXA_DB ?? 'data/ledger.db';
  const dbPath = dbEnv === ':memory:' || isAbsolute(dbEnv) ? dbEnv : resolve(repoRoot, dbEnv);
  const ledger = new SqliteLedger(dbPath);

  // Proof fetcher (used by `/verify`): wrap the ingest client + tolerant parser.
  const client = new TxlineClient({ baseUrl: cfg.txlineBase, jwt: cfg.txlineJwt, apiToken: cfg.txlineApiToken });
  const proofFetcher: ProofFetcher = async (messageId) => {
    try {
      return parseOddsMerkleProof(await client.getOddsMerkleProof(messageId));
    } catch {
      return undefined; // proof endpoint is still TODO(confirm) — degrade gracefully
    }
  };

  const narrator = createNarrator({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: process.env.OPENROUTER_BASE,
    model: process.env.NARRATION_MODEL,
  });

  const prover = new Prover({
    ledger,
    mode,
    proofFetcher,
    narrator,
    cluster: cfg.solanaCluster,
    ...(mode === 'live'
      ? { connection: getConnection(cfg.solanaRpc), wallet: loadWallet(cfg.walletSecret ?? '') }
      : {}),
  });

  const agent = new Agent({ prover, ledger });
  const app = buildServer({ ledger, prover, agent, corpusRoot: repoRoot });

  const port = Number(process.env.PORT ?? 8080);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info?.(`lumixa server listening on :${port} (anchor mode: ${mode})`);
}

main().catch((err) => {
  console.error('lumixa server failed to start:', err);
  process.exitCode = 1;
});
