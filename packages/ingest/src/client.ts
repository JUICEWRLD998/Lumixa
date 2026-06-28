import { parseOddsTick, type OddsTick } from '@lumixa/core';
import {
  fixturesSnapshotUrl,
  oddsIntervalUrl,
  oddsMerkleProofUrl,
  oddsSnapshotUrl,
  scoresSequenceUrl,
  statValidationUrl,
} from './endpoints.js';
import { requestJson, type FetchImpl } from './http.js';

/** Options for constructing a {@link TxlineClient}. */
export interface TxlineClientOptions {
  /** TxLINE base URL (production for free tier, dev base for chain flows). */
  baseUrl: string;
  /** guest/long-lived JWT → sent as `Authorization: Bearer <jwt>`. */
  jwt?: string;
  /** activated API token → sent as `X-Api-Token: <token>`. */
  apiToken?: string;
  /** `fetch`-compatible function; defaults to global `fetch`. */
  fetchImpl?: FetchImpl;
}

/**
 * HTTP client for the TxLINE REST surface used by Lumixa ingest.
 *
 * The client holds the base URL plus whatever auth material is available and
 * injects it on every request. It returns **normalized** odds (via core's
 * {@link parseOddsTick}) for the confirmed snapshot/interval endpoints, and raw
 * `unknown` for the endpoints whose response shapes are not yet documented.
 *
 * SSE subscriptions live in `./sse.ts` and consume this client for config.
 */
export class TxlineClient {
  readonly baseUrl: string;
  jwt?: string;
  apiToken?: string;
  readonly fetchImpl: FetchImpl;

  constructor(opts: TxlineClientOptions) {
    this.baseUrl = opts.baseUrl;
    this.jwt = opts.jwt;
    this.apiToken = opts.apiToken;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /** Auth material to attach to each request, derived from current state. */
  private auth(): { jwt?: string; apiToken?: string } {
    return { jwt: this.jwt, apiToken: this.apiToken };
  }

  /**
   * Coerce a snapshot/interval response (one payload or an array of payloads)
   * into a list of normalized {@link OddsTick}s, validating each via core.
   */
  private normalizeOddsResponse(raw: unknown): OddsTick[] {
    const list = Array.isArray(raw) ? raw : [raw];
    return list.map((item) => parseOddsTick(item));
  }

  /**
   * CONFIRMED — odds snapshot for a fixture.
   * Live snapshot when `asOfMs` is omitted; historical (`?asOf=<ms>`) otherwise.
   * Each returned payload is validated and normalized via core.
   */
  async getOddsSnapshot(fixtureId: number, asOfMs?: number): Promise<OddsTick[]> {
    const raw = await requestJson(
      this.fetchImpl,
      oddsSnapshotUrl(this.baseUrl, fixtureId, asOfMs),
      this.auth(),
    );
    return this.normalizeOddsResponse(raw);
  }

  /**
   * TODO(confirm): exact path not in docs — verify against live API.
   * Historical odds interval (5-min array), the replay corpus source. Assumes
   * the response is an array of raw `OddsPayload`s; each is normalized via core.
   */
  async getOddsInterval(
    fixtureId: number,
    fromMs: number,
    toMs: number,
  ): Promise<OddsTick[]> {
    const raw = await requestJson(
      this.fetchImpl,
      oddsIntervalUrl(this.baseUrl, fixtureId, fromMs, toMs),
      this.auth(),
    );
    return this.normalizeOddsResponse(raw);
  }

  /**
   * TODO(confirm): exact path AND response shape not in docs — verify against
   * live API. Returns the parsed JSON proof bundle untouched.
   */
  async getOddsMerkleProof(messageId: string): Promise<unknown> {
    return requestJson(
      this.fetchImpl,
      oddsMerkleProofUrl(this.baseUrl, messageId),
      this.auth(),
    );
  }

  /**
   * TODO(confirm): exact path AND response shape not in docs — verify against
   * live API. Returns the parsed JSON as a list (the raw value if already an
   * array, otherwise a single-element wrapper).
   */
  async getScoresSequence(fixtureId: number): Promise<unknown[]> {
    const raw = await requestJson(
      this.fetchImpl,
      scoresSequenceUrl(this.baseUrl, fixtureId),
      this.auth(),
    );
    return Array.isArray(raw) ? raw : [raw];
  }

  /**
   * CONFIRMED — score Merkle stat validation
   * (`GET /api/scores/stat-validation?fixtureId&seq&statKey`).
   * The response is the proof bundle consumed by the on-chain `validateStat`
   * `.view()` call; its internal shape is owned by `@lumixa/chain`, so it is
   * returned as `unknown` here.
   */
  async getStatValidation(
    fixtureId: number,
    seq: number,
    statKey: string,
  ): Promise<unknown> {
    return requestJson(
      this.fetchImpl,
      statValidationUrl(this.baseUrl, fixtureId, seq, statKey),
      this.auth(),
    );
  }

  /**
   * TODO(confirm): exact path AND response shape not in docs — verify against
   * live API. Returns the parsed JSON snapshot untouched.
   */
  async getFixturesSnapshot(epochDay?: number): Promise<unknown> {
    return requestJson(
      this.fetchImpl,
      fixturesSnapshotUrl(this.baseUrl, epochDay),
      this.auth(),
    );
  }
}
