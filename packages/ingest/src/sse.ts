import { EventSource, type ErrorEvent, type FetchLike } from 'eventsource';
import { oddsStreamUrl, scoresStreamUrl } from './endpoints.js';
import type { TxlineClient } from './client.js';
import { logger } from './logger.js';

/**
 * Server-Sent-Events subscribers for the TxLINE odds + scores streams, with
 * exponential-backoff reconnection.
 *
 * The exported contract below is depended on byte-for-byte by
 * `scripts/record-live.ts`; do NOT change these signatures.
 *
 * Raw parsed JSON is passed to handlers — normalization is the consumer's job
 * (so the replay corpus captures exactly what the feed sent).
 *
 * Auth headers are injected via `eventsource` v3's custom `fetch` option.
 *
 * TODO(confirm): the SSE stream paths are NOT documented (see endpoints.ts).
 */

/** Handle returned by a subscribe call; `close()` stops reconnection. */
export interface StreamSubscription {
  close(): void;
}

/** Callbacks for the odds SSE stream. */
export interface OddsStreamHandlers {
  /** raw payload as received (un-normalized) */
  onOdds: (raw: unknown) => void;
  onError?: (err: unknown) => void;
  onOpen?: () => void;
}

/** Callbacks for the scores SSE stream. */
export interface ScoreStreamHandlers {
  /** raw payload as received (un-normalized) */
  onScore: (raw: unknown) => void;
  onError?: (err: unknown) => void;
  onOpen?: () => void;
}

/** Initial reconnect delay in ms. */
const BASE_BACKOFF_MS = 500;
/** Reconnect delay ceiling in ms (~30s as specified). */
const MAX_BACKOFF_MS = 30_000;

/** Internal generic handler set, shared by odds + scores subscribers. */
interface MessageHandlers {
  onMessage: (raw: unknown) => void;
  onError?: (err: unknown) => void;
  onOpen?: () => void;
}

/**
 * Open an SSE connection with auth-injecting `fetch` and exponential-backoff
 * reconnect. Returns a {@link StreamSubscription} whose `close()` tears down the
 * current connection and prevents any further reconnect attempts.
 */
function subscribe(
  client: TxlineClient,
  url: string,
  label: string,
  handlers: MessageHandlers,
): StreamSubscription {
  let closed = false;
  let attempt = 0;
  let source: EventSource | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * `eventsource` v3 accepts a custom `fetch` so we can attach the
   * `Authorization` / `X-Api-Token` headers the stream requires. The library's
   * {@link FetchLike} signature is a structural subset of the DOM `fetch`, so we
   * adapt our injected `fetchImpl` through it (its init/response shapes overlap
   * with the standard ones the client already uses).
   */
  const fetchImpl = client.fetchImpl;
  const fetchWithAuth: FetchLike = (input, init) => {
    const headers = new Headers(init.headers as HeadersInit | undefined);
    if (client.jwt !== undefined) {
      headers.set('Authorization', `Bearer ${client.jwt}`);
    }
    if (client.apiToken !== undefined) {
      headers.set('X-Api-Token', client.apiToken);
    }
    return fetchImpl(input, {
      ...init,
      headers,
    } as RequestInit) as ReturnType<FetchLike>;
  };

  const scheduleReconnect = (): void => {
    if (closed) return;
    const delay = Math.min(
      BASE_BACKOFF_MS * 2 ** attempt,
      MAX_BACKOFF_MS,
    );
    attempt += 1;
    logger.warn({ label, delay, attempt }, 'sse reconnect scheduled');
    reconnectTimer = setTimeout(connect, delay);
  };

  function connect(): void {
    if (closed) return;
    const es = new EventSource(url, { fetch: fetchWithAuth });
    source = es;

    es.onopen = (): void => {
      attempt = 0;
      logger.info({ label, url }, 'sse open');
      handlers.onOpen?.();
    };

    es.onmessage = (event: MessageEvent): void => {
      const data = event.data as unknown;
      try {
        const parsed: unknown =
          typeof data === 'string' ? (JSON.parse(data) as unknown) : data;
        handlers.onMessage(parsed);
      } catch (err) {
        logger.error({ label, err }, 'sse message parse failed');
        handlers.onError?.(err);
      }
    };

    es.onerror = (err: ErrorEvent): void => {
      logger.error({ label, err }, 'sse error');
      handlers.onError?.(err);
      // EventSource auto-retries internally, but we own backoff: close and
      // reschedule so close() is authoritative and the delay grows.
      es.close();
      if (source === es) {
        source = undefined;
      }
      scheduleReconnect();
    };
  }

  connect();

  return {
    close(): void {
      closed = true;
      if (reconnectTimer !== undefined) {
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }
      source?.close();
      source = undefined;
      logger.info({ label }, 'sse closed');
    },
  };
}

/**
 * Subscribe to the real-time odds SSE stream for a fixture. Raw parsed payloads
 * are delivered to `handlers.onOdds`; reconnect is automatic with backoff.
 */
export function subscribeOdds(
  client: TxlineClient,
  fixtureId: number,
  handlers: OddsStreamHandlers,
): StreamSubscription {
  return subscribe(
    client,
    oddsStreamUrl(client.baseUrl, fixtureId),
    `odds:${fixtureId}`,
    {
      onMessage: handlers.onOdds,
      onError: handlers.onError,
      onOpen: handlers.onOpen,
    },
  );
}

/**
 * Subscribe to the real-time scores SSE stream for a fixture. Raw parsed
 * payloads are delivered to `handlers.onScore`; reconnect is automatic.
 */
export function subscribeScores(
  client: TxlineClient,
  fixtureId: number,
  handlers: ScoreStreamHandlers,
): StreamSubscription {
  return subscribe(
    client,
    scoresStreamUrl(client.baseUrl, fixtureId),
    `scores:${fixtureId}`,
    {
      onMessage: handlers.onScore,
      onError: handlers.onError,
      onOpen: handlers.onOpen,
    },
  );
}
