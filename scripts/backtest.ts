/**
 * scripts/backtest.ts — run the Sense → Act strategy over a recorded corpus and
 * report CLV (+ best-effort Brier). This is the Phase-2 exit gate: prove the
 * strategy produces positive, explainable Closing Line Value on real data.
 *
 * The corpus is replayed through the SAME `EventSource` the live agent uses, so
 * a positive backtest here is evidence about the live path, not a toy.
 *
 * Usage:
 *   pnpm backtest --match data/123-2026...jsonl
 *   pnpm backtest --match a.jsonl,b.jsonl --config config/strategy.json
 *   pnpm backtest --match a.jsonl --outcomes config/outcomes.json
 *
 * `--outcomes` is a `{ "<fixtureId>": "Home" }` map of realized winners; when
 * absent we try to infer winners from the corpus's score events. CLV is always
 * reported; Brier only for fixtures whose winner is known.
 *
 * Exits non-zero if no decisions were produced (nothing to grade).
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';
import type { Decision, MarketEvent, ScoreEvent } from '@lumixa/core';
import { loadCorpusEvents, createReplaySource } from '@lumixa/replay';
import {
  brier,
  consensusLatest,
  DEFAULT_STRATEGY,
  parseStrategy,
  SignalEngine,
  type StrategyConfig,
} from '@lumixa/engine';
import { Trader } from '@lumixa/trader';

interface BacktestArgs {
  matches: string[];
  configPath?: string;
  outcomesPath?: string;
}

/** Parse `--match` (repeatable / comma list), `--config`, `--outcomes`. */
function parseArgs(argv: string[]): BacktestArgs {
  const matches: string[] = [];
  let configPath: string | undefined;
  let outcomesPath: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--match' || arg === '-m') {
      const value = argv[(i += 1)];
      if (value === undefined) throw new Error(`${arg} requires a value`);
      for (const part of value.split(',')) {
        const p = part.trim();
        if (p.length > 0 && !matches.includes(p)) matches.push(p);
      }
    } else if (arg === '--config' || arg === '-c') {
      configPath = argv[(i += 1)];
      if (configPath === undefined) throw new Error(`${arg} requires a value`);
    } else if (arg === '--outcomes') {
      outcomesPath = argv[(i += 1)];
      if (outcomesPath === undefined) throw new Error(`${arg} requires a value`);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (matches.length === 0) {
    throw new Error('no corpus given — pass at least one `--match <file.jsonl>`');
  }
  return { matches, configPath, outcomesPath };
}

/** Load + validate a strategy config file, or fall back to the defaults. */
function loadConfig(path?: string): StrategyConfig {
  if (path === undefined) return DEFAULT_STRATEGY;
  return parseStrategy(JSON.parse(readFileSync(path, 'utf8')));
}

/** Load an explicit `{ "<fixtureId>": "<winner>" }` map, if provided. */
function loadOutcomes(path?: string): Map<number, string> {
  const out = new Map<number, string>();
  if (path === undefined) return out;
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  for (const [fixtureId, winner] of Object.entries(raw)) {
    if (typeof winner === 'string') out.set(Number(fixtureId), winner);
  }
  return out;
}

/** Pull a numeric field by any of several candidate keys from a loose object. */
function num(obj: unknown, ...keys: string[]): number | undefined {
  if (obj === null || typeof obj !== 'object') return undefined;
  const rec = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === 'number') return v;
  }
  return undefined;
}

/**
 * Best-effort winner inference from a fixture's score events: take the latest
 * event and read a home/away score off its raw payload under a few common key
 * spellings. Returns a 1X2-style label (`Home`/`Draw`/`Away`) or `undefined`.
 */
function inferWinner(scores: ScoreEvent[], fixtureId: number): string | undefined {
  const forFixture = scores
    .filter((s) => s.fixtureId === fixtureId)
    .sort((a, b) => a.ts - b.ts || a.seq - b.seq);
  const last = forFixture[forFixture.length - 1];
  if (last === undefined) return undefined;

  const home = num(last.raw, 'Home', 'HomeScore', 'homeScore', 'home');
  const away = num(last.raw, 'Away', 'AwayScore', 'awayScore', 'away');
  if (home === undefined || away === undefined) return undefined;
  if (home > away) return 'Home';
  if (home < away) return 'Away';
  return 'Draw';
}

function mean(xs: number[]): number {
  if (xs.length === 0) return NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const cfg = loadConfig(args.configPath);
  const explicitOutcomes = loadOutcomes(args.outcomesPath);

  const events: MarketEvent[] = loadCorpusEvents(args.matches);
  if (events.length === 0) {
    console.error('backtest: corpus is empty.');
    process.exitCode = 1;
    return;
  }
  const endTs = events[events.length - 1]?.ts ?? 0;
  const scores = events.flatMap((e) => (e.kind === 'score' ? [e.event] : []));

  const engine = new SignalEngine(cfg);
  const trader = new Trader(cfg);
  engine.onSignal((sig) => trader.onSignal(sig));

  // Infinity speed → deterministic synchronous drain (no timers).
  const source = createReplaySource(events);
  engine.attach(source);
  source.start();

  // Settle every open position against the closing consensus line.
  trader.settle((d: Decision) =>
    consensusLatest(engine.store, { fixtureId: d.fixtureId, market: d.market, outcome: d.side }, endTs),
  );

  const settled = trader.decisions().filter((d) => d.status === 'settled');
  if (trader.decisions().length === 0) {
    console.error('backtest: no decisions were produced — nothing to grade.');
    console.error('  (try a corpus with a clear steam-at-leader move, or relax the strategy config.)');
    process.exitCode = 1;
    return;
  }

  // Resolve winners (explicit map wins; else infer from scores) for Brier.
  const winners = new Map<number, string>();
  for (const d of settled) {
    if (winners.has(d.fixtureId)) continue;
    const w = explicitOutcomes.get(d.fixtureId) ?? inferWinner(scores, d.fixtureId);
    if (w !== undefined) winners.set(d.fixtureId, w);
  }

  console.log(`\nBacktest — ${args.matches.length} file(s), ${events.length} events\n`);
  console.log('  decision            side    entry%   close%    CLV(pp)  leader  result');
  console.log('  ' + '─'.repeat(74));

  const clvs: number[] = [];
  const briers: number[] = [];
  for (const d of settled) {
    const clvPp = (d.clv ?? 0) * 100;
    clvs.push(clvPp);
    const winner = winners.get(d.fixtureId);
    let result = '—';
    if (winner !== undefined) {
      const won = winner === d.side;
      briers.push(brier(d.entryPct, won));
      result = won ? 'WON' : 'lost';
    }
    console.log(
      `  ${d.id.slice(0, 18).padEnd(18)}  ${d.side.padEnd(6)}  ` +
        `${d.entryPct.toFixed(2).padStart(6)}  ${(d.closingPct ?? 0).toFixed(2).padStart(6)}  ` +
        `${clvPp.toFixed(2).padStart(7)}  ${String(d.leaderBook).padStart(6)}  ${result}`,
    );
  }

  const meanClv = mean(clvs);
  const positive = clvs.filter((c) => c > 0).length;
  console.log('  ' + '─'.repeat(74));
  console.log(
    `\n  decisions ${settled.length}  ·  mean CLV ${meanClv.toFixed(3)} pp  ·  ` +
      `positive ${positive}/${clvs.length} (${((positive / clvs.length) * 100).toFixed(0)}%)`,
  );
  if (briers.length > 0) {
    console.log(`  mean Brier ${mean(briers).toFixed(4)} over ${briers.length} graded outcome(s)`);
  } else {
    console.log('  Brier: no realized outcomes available (pass --outcomes to grade calibration)');
  }

  // Exit non-zero if the strategy did not beat the close on average — the gate.
  if (!(meanClv > 0)) {
    console.error('\nbacktest: mean CLV is not positive — strategy did not beat the close.');
    process.exitCode = 1;
  }
}

main();
