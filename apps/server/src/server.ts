import { isAbsolute, resolve } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { LedgerRepository, Prover } from '@lumixa/prover';
import type { Agent } from './agent.js';

/** Dependencies the HTTP layer needs — all injected so tests can use fakes. */
export interface ServerDeps {
  ledger: LedgerRepository;
  prover: Prover;
  agent: Agent;
  /** clock for `verifiedAt` stamps; defaults to `Date.now` (injectable in tests) */
  now?: () => number;
  /**
   * Root to resolve relative `/replay/start` corpus paths against. The process
   * cwd is the package dir under pnpm, so the dashboard can send repo-relative
   * paths (e.g. `data/synthetic-777.jsonl`) and the server makes them absolute.
   * Defaults to `process.cwd()`.
   */
  corpusRoot?: string;
}

const ReplayBody = z.object({
  /** corpus file path, or comma-separated list of paths */
  match: z.string().min(1),
  /** virtual-clock multiplier; omit for an instant drain */
  speed: z.number().positive().optional(),
});

/**
 * Build the Lumixa API — the judge-testable surface (`implementation.md` §5/§10):
 *
 *   GET  /health             liveness
 *   GET  /ledger             the full append-only ledger (CLV/Brier/txSig/status)
 *   GET  /state              live agent state (positions, signals, topology)
 *   GET  /verify/:id         re-verify a decision (Merkle proof + memo, on demand)
 *   POST /replay/start       drive the agent over a recorded corpus
 *
 * Returns a configured (not-yet-listening) Fastify instance so `index.ts` can
 * `listen()` and tests can `inject()` without a socket.
 */
export function buildServer(deps: ServerDeps): FastifyInstance {
  const { ledger, prover, agent } = deps;
  const now = deps.now ?? (() => Date.now());
  const corpusRoot = deps.corpusRoot ?? process.cwd();
  const app = Fastify({ logger: false });

  // Minimal permissive CORS so the dashboard (different dev origin / deployed
  // host) can call the API directly. No dependency — just the three headers a
  // browser preflight needs; short-circuit OPTIONS.
  app.addHook('onRequest', async (req, reply) => {
    reply.header('access-control-allow-origin', '*');
    reply.header('access-control-allow-methods', 'GET,POST,OPTIONS');
    reply.header('access-control-allow-headers', 'content-type');
    if (req.method === 'OPTIONS') reply.code(204).send();
  });

  app.get('/health', async () => ({ ok: true, service: 'lumixa' }));

  app.get('/ledger', async () => {
    const rows = ledger.list();
    return { count: rows.length, decisions: rows };
  });

  app.get('/state', async () => agent.state());

  app.get('/verify/:decisionId', async (req, reply) => {
    const { decisionId } = req.params as { decisionId: string };
    try {
      return await prover.verify(decisionId, now());
    } catch (err) {
      return reply.code(404).send({ error: (err as Error).message });
    }
  });

  app.post('/replay/start', async (req, reply) => {
    const parsed = ReplayBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid body', issues: parsed.error.issues });
    }
    const paths = parsed.data.match
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
      .map((p) => (isAbsolute(p) ? p : resolve(corpusRoot, p)));
    try {
      const result = await agent.runReplay(paths, parsed.data.speed ?? Infinity);
      return { started: true, ...result };
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message });
    }
  });

  return app;
}
