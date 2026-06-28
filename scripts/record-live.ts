/**
 * scripts/record-live.ts — capture the replay corpus from the live TxLINE feed.
 *
 * Subscribes to the real-time odds + scores SSE streams for one or more
 * fixtures and appends every raw payload, byte-faithful, to a JSONL file per
 * fixture under `data/`. Normalization happens on READ (see `replay-check.ts`
 * and the Phase-1 replay engine), so the corpus is a lossless record of exactly
 * what the feed sent — the backbone of the offline demo once the matches end.
 *
 * Usage:
 *   pnpm record --fixture 123456789 [--fixture 987...] [--out data] [--minutes 90]
 *   pnpm record --fixture 123,456,789
 *
 * Auth: uses a fresh guest JWT (WC free tier). The long-lived API-token path
 * depends on the on-chain `subscribe` flow, which is Phase-3 work.
 *
 * Stop with Ctrl-C (SIGINT) or let `--minutes` auto-stop it; on shutdown the
 * write streams are flushed and a per-fixture capture summary is printed.
 */
import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { encodeRecord, loadConfig, makeRecord, type RecordKind } from '@lumixa/core';
import {
  createGuestClient,
  logger,
  subscribeOdds,
  subscribeScores,
  type StreamSubscription,
} from '@lumixa/ingest';

/** Parsed command-line options for the recorder. */
interface RecorderArgs {
  /** fixture ids to record (deduplicated, order-preserved) */
  fixtures: number[];
  /** output directory for the corpus JSONL files */
  outDir: string;
  /** optional auto-stop after this many minutes */
  minutes?: number;
}

/** Per-fixture capture state: the open file + running counts. */
interface FixtureCapture {
  fixtureId: number;
  filePath: string;
  stream: WriteStream;
  subscriptions: StreamSubscription[];
  oddsCount: number;
  scoreCount: number;
}

/**
 * Parse `process.argv`. Accepts repeated `--fixture <id>` flags and/or a single
 * comma-separated list; `--out <dir>` (default `data`); `--minutes <n>`.
 */
function parseArgs(argv: string[]): RecorderArgs {
  const fixtures: number[] = [];
  let outDir = 'data';
  let minutes: number | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--fixture' || arg === '-f') {
      const value = argv[(i += 1)];
      if (value === undefined) throw new Error(`${arg} requires a value`);
      for (const part of value.split(',')) {
        const id = Number(part.trim());
        if (!Number.isInteger(id)) {
          throw new Error(`invalid fixture id: ${JSON.stringify(part)}`);
        }
        if (!fixtures.includes(id)) fixtures.push(id);
      }
    } else if (arg === '--out' || arg === '-o') {
      const value = argv[(i += 1)];
      if (value === undefined) throw new Error(`${arg} requires a value`);
      outDir = value;
    } else if (arg === '--minutes' || arg === '-m') {
      const value = argv[(i += 1)];
      if (value === undefined) throw new Error(`${arg} requires a value`);
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`--minutes must be a positive number, got ${value}`);
      }
      minutes = n;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (fixtures.length === 0) {
    throw new Error(
      'no fixtures given — pass at least one `--fixture <id>` (or `--fixture id1,id2`)',
    );
  }
  return { fixtures, outDir, minutes };
}

/** Best-effort load of a local `.env` into `process.env` (Node 22 builtin). */
function loadDotEnv(): void {
  try {
    process.loadEnvFile('.env');
  } catch {
    // No .env (e.g. CI / env already exported) — config is read from the
    // ambient environment instead. Not an error.
  }
}

/** `YYYYMMDD` in UTC, for stable corpus filenames regardless of host TZ. */
function utcDateStamp(now: Date): string {
  return now.toISOString().slice(0, 10).replace(/-/g, '');
}

/** Pull the odds tick id (`MessageId`) out of a raw payload, if present. */
function messageIdOf(raw: unknown): string | undefined {
  if (raw !== null && typeof raw === 'object' && 'MessageId' in raw) {
    const id = (raw as { MessageId: unknown }).MessageId;
    if (typeof id === 'string') return id;
  }
  return undefined;
}

/** Open the corpus file for a fixture and write its `meta` header line. */
function openCapture(
  fixtureId: number,
  outDir: string,
  meta: Record<string, unknown>,
  now: Date,
): FixtureCapture {
  const filePath = join(outDir, `${fixtureId}-${utcDateStamp(now)}.jsonl`);
  const stream = createWriteStream(filePath, { flags: 'a' });
  const capture: FixtureCapture = {
    fixtureId,
    filePath,
    stream,
    subscriptions: [],
    oddsCount: 0,
    scoreCount: 0,
  };
  writeRecord(capture, 'meta', { fixtureId, startedAt: now.toISOString(), ...meta });
  return capture;
}

/** Append one corpus envelope to a fixture's JSONL file. */
function writeRecord(
  capture: FixtureCapture,
  kind: RecordKind,
  payload: unknown,
  id?: string,
): void {
  const env = makeRecord(kind, payload, Date.now(), {
    fixtureId: capture.fixtureId,
    id,
  });
  capture.stream.write(`${encodeRecord(env)}\n`);
}

async function main(): Promise<void> {
  loadDotEnv();
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();

  mkdirSync(args.outDir, { recursive: true });
  logger.info(
    { fixtures: args.fixtures, outDir: args.outDir, minutes: args.minutes },
    'record-live starting',
  );

  const client = await createGuestClient(config);
  const now = new Date();
  const meta = {
    leagues: config.selectedLeagues,
    serviceLevelId: config.serviceLevelId,
  };

  const captures = args.fixtures.map((fixtureId) =>
    openCapture(fixtureId, args.outDir, meta, now),
  );

  for (const capture of captures) {
    const { fixtureId } = capture;
    capture.subscriptions.push(
      subscribeOdds(client, fixtureId, {
        onOdds: (raw) => {
          capture.oddsCount += 1;
          writeRecord(capture, 'odds', raw, messageIdOf(raw));
        },
        onError: (err) => logger.error({ fixtureId, err }, 'odds stream error'),
      }),
      subscribeScores(client, fixtureId, {
        onScore: (raw) => {
          capture.scoreCount += 1;
          writeRecord(capture, 'score', raw);
        },
        onError: (err) => logger.error({ fixtureId, err }, 'scores stream error'),
      }),
    );
    logger.info({ fixtureId, file: capture.filePath }, 'capturing fixture');
  }

  // Periodic heartbeat so a long capture shows it is alive and progressing.
  const heartbeat = setInterval(() => {
    for (const c of captures) {
      logger.info(
        { fixtureId: c.fixtureId, odds: c.oddsCount, scores: c.scoreCount },
        'capture progress',
      );
    }
  }, 30_000);

  let shuttingDown = false;
  const shutdown = (reason: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(heartbeat);
    logger.info({ reason }, 'record-live stopping');

    let pending = captures.length;
    if (pending === 0) process.exit(0);
    for (const c of captures) {
      for (const sub of c.subscriptions) sub.close();
      logger.info(
        { fixtureId: c.fixtureId, odds: c.oddsCount, scores: c.scoreCount, file: c.filePath },
        'capture summary',
      );
      c.stream.end(() => {
        pending -= 1;
        if (pending === 0) process.exit(0);
      });
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  if (args.minutes !== undefined) {
    setTimeout(() => shutdown(`--minutes ${args.minutes} elapsed`), args.minutes * 60_000);
  }
}

main().catch((err: unknown) => {
  logger.error({ err }, 'record-live failed');
  process.exitCode = 1;
});
