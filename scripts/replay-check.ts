/**
 * scripts/replay-check.ts — verify the recorded corpus is re-readable.
 *
 * This is the Phase-0 exit gate: prove that every JSONL line written by
 * `record-live.ts` can be decoded back into a `RecordEnvelope` and re-normalized
 * (odds ⇒ `OddsTick`, scores ⇒ `ScoreEvent`) without loss. It also runs the
 * demargin sanity check — each odds tick's `Pct` should sum to ≈100 — and
 * reports anything off. The full deterministic virtual-clock replay engine is
 * Phase-1 work; this is the lightweight read-back validator it builds on.
 *
 * Usage:
 *   pnpm replay:check                 # check every *.jsonl under data/
 *   pnpm replay:check data            # check a directory
 *   pnpm replay:check data/123-2026...jsonl   # check specific file(s)
 *
 * Exits non-zero if any line fails to decode (corpus is not faithfully
 * re-readable). Demargin drift is reported as a warning, not a hard failure.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { decodeRecord, normalizeScorePayload, parseOddsTick } from '@lumixa/core';

/** Tolerance (percentage points) for the `Pct`-sums-to-100 sanity check. */
const DEMARGIN_TOLERANCE_PP = 0.1;

/** Aggregated result of validating one corpus file. */
interface FileReport {
  file: string;
  lines: number;
  odds: number;
  scores: number;
  meta: number;
  /** lines that failed to decode/normalize (corpus corruption) */
  decodeErrors: number;
  /** odds ticks whose demargined `Pct` strayed from 100 beyond tolerance */
  demarginWarnings: number;
  firstError?: string;
}

/** Resolve CLI inputs to a concrete list of `.jsonl` files to check. */
function resolveTargets(argv: string[]): string[] {
  const inputs = argv.length > 0 ? argv : ['data'];
  const files: string[] = [];
  for (const input of inputs) {
    const stat = statSync(input);
    if (stat.isDirectory()) {
      for (const name of readdirSync(input)) {
        if (name.endsWith('.jsonl')) files.push(join(input, name));
      }
    } else {
      files.push(input);
    }
  }
  return files;
}

/** Decode + re-normalize every line of one corpus file into a {@link FileReport}. */
function checkFile(file: string): FileReport {
  const report: FileReport = {
    file,
    lines: 0,
    odds: 0,
    scores: 0,
    meta: 0,
    decodeErrors: 0,
    demarginWarnings: 0,
  };

  const lines = readFileSync(file, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined || line.trim().length === 0) continue;
    report.lines += 1;
    try {
      const env = decodeRecord(line);
      if (env.kind === 'odds') {
        report.odds += 1;
        const tick = parseOddsTick(env.payload);
        const sum = tick.pct.reduce((a, b) => a + b, 0);
        if (Math.abs(sum - 100) > DEMARGIN_TOLERANCE_PP) {
          report.demarginWarnings += 1;
        }
      } else if (env.kind === 'score') {
        report.scores += 1;
        normalizeScorePayload(env.payload);
      } else {
        report.meta += 1;
      }
    } catch (err) {
      report.decodeErrors += 1;
      report.firstError ??= `line ${i + 1}: ${String(err)}`;
    }
  }
  return report;
}

function main(): void {
  const targets = resolveTargets(process.argv.slice(2));
  if (targets.length === 0) {
    console.error('replay-check: no .jsonl files found (looked under data/).');
    process.exitCode = 1;
    return;
  }

  let totalErrors = 0;
  let totalWarnings = 0;
  for (const file of targets) {
    const r = checkFile(file);
    totalErrors += r.decodeErrors;
    totalWarnings += r.demarginWarnings;
    const status = r.decodeErrors > 0 ? 'FAIL' : 'ok';
    console.log(
      `[${status}] ${r.file} — ${r.lines} lines ` +
        `(odds ${r.odds}, scores ${r.scores}, meta ${r.meta}); ` +
        `decodeErrors ${r.decodeErrors}, demarginWarnings ${r.demarginWarnings}`,
    );
    if (r.firstError !== undefined) console.log(`         first error: ${r.firstError}`);
  }

  console.log(
    `\nchecked ${targets.length} file(s): ` +
      `${totalErrors} decode error(s), ${totalWarnings} demargin warning(s).`,
  );
  if (totalErrors > 0) process.exitCode = 1;
}

main();
