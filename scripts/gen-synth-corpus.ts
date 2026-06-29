/**
 * scripts/gen-synth-corpus.ts — generate a SYNTHETIC replay corpus.
 *
 * Real World Cup data is recorded live (during the free window) via
 * `record-live.ts`; until then this produces a deterministic, hand-shaped
 * corpus that exercises the full Sense → Act pipeline. It encodes the canonical
 * scenario: a price-discovery LEADER book steams the Home line up while two
 * follower books lag by two steps, then the followers converge to the leader by
 * close — so the strategy enters below the closing line and earns positive CLV.
 *
 * The output is a real JSONL corpus (same `RecordEnvelope` format as
 * `record-live.ts`), so `pnpm replay:check` and `pnpm backtest` consume it
 * exactly as they would live data.
 *
 * Usage:  pnpm tsx scripts/gen-synth-corpus.ts [--out data] [--fixture 777]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { encodeRecord, makeRecord, type RecordEnvelope } from '@lumixa/core';

const STEP = 5_000; // ms between ticks (matches the engine's resample grid)
const LEADER = 9;
const FOLLOWERS = [1, 2];
const LAG_STEPS = 2;

/** Home demargined `Pct` path: gentle wiggle → steam ramp → plateau. */
function homePct(k: number): number {
  if (k <= 30) return 48 + 0.6 * Math.sin(k * 1.1); // sub-threshold wiggle
  if (k <= 45) return 48 + (k - 30) * 0.8; // steam ramp 48 → 60
  return 60; // plateau (followers catch up here)
}

/** A raw wire `OddsPayload` for one book's 1X2 quote at one instant. */
function oddsPayload(book: number, fixtureId: number, ts: number, home: number): unknown {
  const rest = (100 - home) / 2;
  const pct = [home, rest, rest];
  return {
    FixtureId: fixtureId,
    MessageId: `${book}-${ts}`,
    Ts: ts,
    Bookmaker: `B${book}`,
    BookmakerId: book,
    SuperOddsType: '1X2',
    GameState: 'FirstHalf',
    InRunning: true,
    MarketParameters: '0',
    MarketPeriod: 'FullTime',
    PriceNames: ['Home', 'Draw', 'Away'],
    Prices: pct.map((p) => Math.round((10_000 / p))), // decimal odds ×100
    Pct: pct.map((p) => p.toFixed(3)),
  };
}

function parseArgs(argv: string[]): { outDir: string; fixtureId: number } {
  let outDir = 'data';
  let fixtureId = 777;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = argv[(i += 1)];
    if (value === undefined) throw new Error(`${arg} requires a value`);
    if (arg === '--out' || arg === '-o') outDir = value;
    else if (arg === '--fixture' || arg === '-f') fixtureId = Number(value);
    else throw new Error(`unknown argument: ${arg}`);
  }
  return { outDir, fixtureId };
}

function main(): void {
  const { outDir, fixtureId } = parseArgs(process.argv.slice(2));
  const lines: string[] = [];
  const push = (env: RecordEnvelope): void => void lines.push(encodeRecord(env));

  push(makeRecord('meta', { fixtureId, synthetic: true, scenario: 'leader-steam' }, 0, { fixtureId }));

  const LAST_K = 58;
  for (let k = 0; k <= LAST_K; k += 1) {
    const v = homePct(k);
    const leaderTs = k * STEP;
    push(
      makeRecord('odds', oddsPayload(LEADER, fixtureId, leaderTs, v), leaderTs, {
        fixtureId,
        id: `${LEADER}-${leaderTs}`,
      }),
    );
    const followerTs = (k + LAG_STEPS) * STEP; // followers replay the leader, lagged
    for (const f of FOLLOWERS) {
      push(
        makeRecord('odds', oddsPayload(f, fixtureId, followerTs, v), followerTs, {
          fixtureId,
          id: `${f}-${followerTs}`,
        }),
      );
    }
  }

  mkdirSync(outDir, { recursive: true });
  const filePath = join(outDir, `synthetic-${fixtureId}.jsonl`);
  writeFileSync(filePath, lines.join('\n') + '\n');
  console.log(`wrote ${lines.length} lines → ${filePath}`);
}

main();
