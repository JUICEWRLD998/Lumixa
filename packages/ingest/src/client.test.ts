import { describe, it, expect, vi } from 'vitest';
import { TxlineClient } from './client.js';
import { HttpError, type FetchImpl } from './http.js';

const BASE = 'https://txline.example.com';

/** A raw `OddsPayload` exactly as the snapshot endpoint would return it. */
const RAW_ODDS = {
  FixtureId: 123456789,
  MessageId: 'msg-abc-001',
  Ts: 1718000000000,
  Bookmaker: 'ExampleBook',
  BookmakerId: 42,
  SuperOddsType: '1X2',
  GameState: 'FirstHalf',
  InRunning: true,
  MarketParameters: '0',
  MarketPeriod: 'FullTime',
  PriceNames: ['Home', 'Draw', 'Away'],
  Prices: [190, 340, 410],
  Pct: ['52.632', '29.412', '24.390'],
};

/**
 * Build a minimal `Response`-like object good enough for {@link requestJson},
 * which only reads `ok`, `status`, and `text()`. Cast to `Response` for typing.
 */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

/** Build a fake `fetchImpl` returning a fixed response, recording its call. */
function fakeFetch(response: Response): {
  fetchImpl: FetchImpl;
  calls: Array<{ url: string; init: RequestInit | undefined }>;
} {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchImpl = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return Promise.resolve(response);
  }) as unknown as FetchImpl;
  return { fetchImpl, calls };
}

describe('TxlineClient.getOddsSnapshot', () => {
  it('normalizes a single raw payload (price ×100 → decimal, Pct → number)', async () => {
    const { fetchImpl } = fakeFetch(jsonResponse(RAW_ODDS));
    const client = new TxlineClient({ baseUrl: BASE, fetchImpl });

    const ticks = await client.getOddsSnapshot(123456789);

    expect(ticks).toHaveLength(1);
    const tick = ticks[0];
    expect(tick).toBeDefined();
    expect(tick?.prices).toEqual([1.9, 3.4, 4.1]);
    expect(tick?.pct).toEqual([52.632, 29.412, 24.39]);
    expect(tick?.market).toBe('1X2');
  });

  it('normalizes an array response', async () => {
    const { fetchImpl } = fakeFetch(jsonResponse([RAW_ODDS, RAW_ODDS]));
    const client = new TxlineClient({ baseUrl: BASE, fetchImpl });

    const ticks = await client.getOddsSnapshot(123456789);
    expect(ticks).toHaveLength(2);
  });

  it('targets the snapshot URL and appends asOf when given', async () => {
    const { fetchImpl, calls } = fakeFetch(jsonResponse(RAW_ODDS));
    const client = new TxlineClient({ baseUrl: BASE, fetchImpl });

    await client.getOddsSnapshot(123456789, 1718000000000);
    expect(calls[0]?.url).toBe(
      `${BASE}/api/odds/snapshot/123456789?asOf=1718000000000`,
    );
  });

  it('injects Authorization and X-Api-Token headers', async () => {
    const { fetchImpl, calls } = fakeFetch(jsonResponse(RAW_ODDS));
    const client = new TxlineClient({
      baseUrl: BASE,
      jwt: 'jwt-token',
      apiToken: 'api-token',
      fetchImpl,
    });

    await client.getOddsSnapshot(123456789);
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer jwt-token');
    expect(headers['X-Api-Token']).toBe('api-token');
  });

  it('throws HttpError on a non-2xx response', async () => {
    const { fetchImpl } = fakeFetch(jsonResponse({ error: 'nope' }, 403));
    const client = new TxlineClient({ baseUrl: BASE, fetchImpl });

    await expect(client.getOddsSnapshot(123456789)).rejects.toBeInstanceOf(
      HttpError,
    );
  });
});

describe('TxlineClient.getStatValidation', () => {
  it('returns the raw proof bundle and hits the confirmed URL', async () => {
    const proof = { summary: {}, statProof: [] };
    const { fetchImpl, calls } = fakeFetch(jsonResponse(proof));
    const client = new TxlineClient({ baseUrl: BASE, fetchImpl });

    const result = await client.getStatValidation(123, 7, 'score');
    expect(result).toEqual(proof);
    expect(calls[0]?.url).toBe(
      `${BASE}/api/scores/stat-validation?fixtureId=123&seq=7&statKey=score`,
    );
  });
});
