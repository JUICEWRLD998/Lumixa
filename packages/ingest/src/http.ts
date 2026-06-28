/**
 * Tiny JSON-over-HTTP wrapper used by every TxLINE client method.
 *
 * Responsibilities, kept deliberately small:
 *  - inject `Authorization: Bearer <jwt>` and/or `X-Api-Token: <token>` headers
 *  - serialize JSON request bodies and set `Content-Type`/`Accept`
 *  - throw a descriptive {@link HttpError} on any non-2xx response
 *  - parse the response body as JSON and return it as `unknown`
 *
 * The actual `fetch` implementation is injectable so callers (and tests) can
 * swap in `undici.fetch`, the global `fetch`, or a deterministic fake.
 */

/** A `fetch`-compatible function. Mirrors the standard `fetch` signature. */
export type FetchImpl = typeof fetch;

/** Auth material attached to a request, if available. */
export interface AuthHeaders {
  /** guest/long-lived JWT → `Authorization: Bearer <jwt>` */
  jwt?: string;
  /** activated API token → `X-Api-Token: <token>` */
  apiToken?: string;
}

/** Options for a single {@link requestJson} call. */
export interface RequestOptions extends AuthHeaders {
  /** HTTP method; defaults to `GET`. */
  method?: string;
  /** JSON-serializable request body; sets `Content-Type: application/json`. */
  body?: unknown;
  /** Extra headers merged on top of the defaults. */
  headers?: Record<string, string>;
}

/** Max number of body characters included in a thrown {@link HttpError}. */
const ERROR_BODY_SNIPPET = 512;

/**
 * Error thrown for any non-2xx HTTP response. Carries the status code and a
 * (truncated) snippet of the response body to make failures debuggable without
 * leaking an unbounded payload into logs.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly url: string;
  readonly bodySnippet: string;

  constructor(status: number, url: string, bodySnippet: string) {
    super(`HTTP ${status} for ${url}: ${bodySnippet}`);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
    this.bodySnippet = bodySnippet;
  }
}

/** Build the request headers, injecting auth + JSON defaults. */
function buildHeaders(opts: RequestOptions): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...opts.headers,
  };
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (opts.jwt !== undefined) {
    headers['Authorization'] = `Bearer ${opts.jwt}`;
  }
  if (opts.apiToken !== undefined) {
    headers['X-Api-Token'] = opts.apiToken;
  }
  return headers;
}

/**
 * Perform a JSON request and return the parsed body as `unknown`.
 *
 * Throws {@link HttpError} on a non-2xx status (with a body snippet), and a
 * generic `Error` if a 2xx body fails to parse as JSON. The caller is
 * responsible for validating/narrowing the returned `unknown` (e.g. via zod).
 *
 * @param fetchImpl `fetch`-compatible function (injected for testability).
 * @param url absolute request URL.
 * @param opts method, body, and auth/header overrides.
 */
export async function requestJson(
  fetchImpl: FetchImpl,
  url: string,
  opts: RequestOptions = {},
): Promise<unknown> {
  const init: RequestInit = {
    method: opts.method ?? 'GET',
    headers: buildHeaders(opts),
  };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
  }

  const res = await fetchImpl(url, init);
  const text = await res.text();

  if (!res.ok) {
    throw new HttpError(res.status, url, text.slice(0, ERROR_BODY_SNIPPET));
  }

  if (text.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (cause) {
    throw new Error(
      `failed to parse JSON response from ${url}: ${String(cause)}`,
    );
  }
}
