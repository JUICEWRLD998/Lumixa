import 'dotenv/config';
import process from 'node:process';
import { loadConfig } from '@lumixa/core';
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
  const ledger = new SqliteLedger(process.env.LUMIXA_DB ?? 'data/ledger.db');

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
  const app = buildServer({ ledger, prover, agent });

  const port = Number(process.env.PORT ?? 8080);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info?.(`lumixa server listening on :${port} (anchor mode: ${mode})`);
}

main().catch((err) => {
  console.error('lumixa server failed to start:', err);
  process.exitCode = 1;
});
