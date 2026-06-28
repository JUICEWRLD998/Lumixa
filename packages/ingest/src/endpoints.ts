/**
 * Centralized URL builders for every TxLINE endpoint this client talks to.
 *
 * ─── Honesty about unknowns ─────────────────────────────────────────────────
 * The TxLINE docs only fully specify a handful of paths. To avoid silently
 * shipping guesses, EVERY path lives here with an explicit confidence marker:
 *
 *   CONFIRMED — path is documented in our integration reference and modeled
 *               with a real response schema downstream.
 *   TODO(confirm) — path is NOT in the docs; it is a best-effort guess and
 *               MUST be verified against the live API before trusting it. The
 *               response shape is treated as `unknown` downstream.
 *
 * Confirmed paths:
 *   - POST /auth/guest/start
 *   - POST /api/token/activate
 *   - GET  /api/odds/snapshot/{fixtureId}   (optional ?asOf=<ms>)
 *   - GET  /api/scores/stat-validation      (?fixtureId&seq&statKey)
 *
 * Assumed paths (TODO(confirm)):
 *   - odds SSE stream
 *   - scores SSE stream / sequence
 *   - historical odds interval (replay corpus source)
 *   - odds Merkle proof
 *   - fixtures snapshot
 */

/** Join a base URL and a path, tolerating a trailing slash on the base. */
function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const rel = path.startsWith('/') ? path : `/${path}`;
  return `${base}${rel}`;
}

/**
 * Append query params to a URL, skipping `undefined` values. Numbers and
 * strings are coerced via `URLSearchParams`. Returns the URL unchanged when no
 * params are supplied.
 */
function withQuery(
  url: string,
  params: Record<string, string | number | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs.length > 0 ? `${url}?${qs}` : url;
}

/** CONFIRMED — guest auth: returns a 30-day guest JWT. */
export function guestStartUrl(baseUrl: string): string {
  return joinUrl(baseUrl, '/auth/guest/start');
}

/** CONFIRMED — token activation: exchanges a wallet signature for an API token. */
export function activateTokenUrl(baseUrl: string): string {
  return joinUrl(baseUrl, '/api/token/activate');
}

/**
 * CONFIRMED — odds snapshot for a fixture. Pass `asOfMs` for a historical
 * snapshot (`?asOf=<ms>`); omit it for the live snapshot.
 */
export function oddsSnapshotUrl(
  baseUrl: string,
  fixtureId: number,
  asOfMs?: number,
): string {
  return withQuery(joinUrl(baseUrl, `/api/odds/snapshot/${fixtureId}`), {
    asOf: asOfMs,
  });
}

/**
 * TODO(confirm): exact path not in docs — verify against live API.
 * Historical odds interval (5-minute array) — the replay corpus source. The
 * `from`/`to` query parameter names are guessed.
 */
export function oddsIntervalUrl(
  baseUrl: string,
  fixtureId: number,
  fromMs: number,
  toMs: number,
): string {
  return withQuery(joinUrl(baseUrl, `/api/odds/interval/${fixtureId}`), {
    from: fromMs,
    to: toMs,
  });
}

/**
 * TODO(confirm): exact path not in docs — verify against live API.
 * Merkle proof for a specific odds update, keyed by its `MessageId`.
 */
export function oddsMerkleProofUrl(baseUrl: string, messageId: string): string {
  return joinUrl(
    baseUrl,
    `/api/odds/merkle-proof/${encodeURIComponent(messageId)}`,
  );
}

/**
 * TODO(confirm): exact path not in docs — verify against live API.
 * Real-time odds SSE stream for a fixture.
 */
export function oddsStreamUrl(baseUrl: string, fixtureId: number): string {
  return joinUrl(baseUrl, `/api/odds/stream/${fixtureId}`);
}

/**
 * TODO(confirm): exact path not in docs — verify against live API.
 * Real-time scores SSE stream for a fixture.
 */
export function scoresStreamUrl(baseUrl: string, fixtureId: number): string {
  return joinUrl(baseUrl, `/api/scores/stream/${fixtureId}`);
}

/**
 * TODO(confirm): exact path not in docs — verify against live API.
 * Full scores sequence for a fixture (the backfill companion to the stream).
 */
export function scoresSequenceUrl(baseUrl: string, fixtureId: number): string {
  return joinUrl(baseUrl, `/api/scores/sequence/${fixtureId}`);
}

/**
 * CONFIRMED — score Merkle stat validation. Returns the proof bundle
 * (`summary`, `subTreeProof`, `mainTreeProof`, `statToProve`, `eventStatRoot`,
 * `statProof`) used by the on-chain `validateStat` `.view()` call.
 */
export function statValidationUrl(
  baseUrl: string,
  fixtureId: number,
  seq: number,
  statKey: string,
): string {
  return withQuery(joinUrl(baseUrl, '/api/scores/stat-validation'), {
    fixtureId,
    seq,
    statKey,
  });
}

/**
 * TODO(confirm): exact path not in docs — verify against live API.
 * Latest fixtures snapshot, optionally for a specific epoch day.
 */
export function fixturesSnapshotUrl(baseUrl: string, epochDay?: number): string {
  return withQuery(joinUrl(baseUrl, '/api/fixtures/snapshot'), {
    epochDay,
  });
}
