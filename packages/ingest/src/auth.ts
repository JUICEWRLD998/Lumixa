import { z } from 'zod';
import { activateTokenUrl, guestStartUrl } from './endpoints.js';
import { requestJson, type FetchImpl } from './http.js';

/**
 * Auth flows against the TxLINE API.
 *
 * Two tokens exist:
 *  - a **guest JWT** (30-day, free tier) obtained from `/auth/guest/start`;
 *  - a **long-lived API token** obtained from `/api/token/activate` once an
 *    on-chain subscribe has been performed elsewhere (the `@lumixa/chain`
 *    package). This module performs ONLY the HTTP `activate` call — it never
 *    signs anything. The caller supplies the precomputed `walletSignature`.
 */

/** Response shape of `POST /auth/guest/start` (tolerant of casing). */
const GuestStartResponseSchema = z
  .object({
    jwt: z.string().optional(),
    token: z.string().optional(),
    Jwt: z.string().optional(),
    Token: z.string().optional(),
  })
  .passthrough();

/** Response shape of `POST /api/token/activate` (tolerant of casing). */
const ActivateResponseSchema = z
  .object({
    apiToken: z.string().optional(),
    token: z.string().optional(),
    ApiToken: z.string().optional(),
    Token: z.string().optional(),
  })
  .passthrough();

/** Result of {@link guestStart}. */
export interface GuestStartResult {
  /** the guest JWT to send as `Authorization: Bearer <jwt>` */
  jwt: string;
}

/** Parameters for {@link activateToken}. */
export interface ActivateTokenParams {
  /** the guest JWT obtained from {@link guestStart} */
  jwt: string;
  /** the on-chain subscribe transaction signature */
  txSig: string;
  /** the leagues string the subscription covers, e.g. `"worldcup"` */
  leagues: string;
  /**
   * `nacl.sign.detached(`${txSig}:${leagues}:${jwt}`)` — computed by the caller
   * (the `@lumixa/chain` package). This module does NOT sign; it only forwards
   * the signature to the activation endpoint.
   */
  walletSignature: string;
}

/** Result of {@link activateToken}. */
export interface ActivateTokenResult {
  /** the long-lived API token to send as `X-Api-Token: <token>` */
  apiToken: string;
}

/**
 * Start a guest session: `POST {base}/auth/guest/start` → guest JWT.
 *
 * @param baseUrl TxLINE base URL (production base for the WC free tier).
 * @param fetchImpl `fetch`-compatible function; defaults to global `fetch`.
 * @returns `{ jwt }` to seed a {@link import('./client.js').TxlineClient}.
 * @throws if the response omits a recognizable JWT field.
 */
export async function guestStart(
  baseUrl: string,
  fetchImpl: FetchImpl = fetch,
): Promise<GuestStartResult> {
  const raw = await requestJson(fetchImpl, guestStartUrl(baseUrl), {
    method: 'POST',
  });
  const parsed = GuestStartResponseSchema.parse(raw);
  const jwt = parsed.jwt ?? parsed.token ?? parsed.Jwt ?? parsed.Token;
  if (jwt === undefined) {
    throw new Error('guestStart: response did not contain a JWT');
  }
  return { jwt };
}

/**
 * Activate a long-lived API token:
 * `POST {base}/api/token/activate` with the precomputed `walletSignature`.
 *
 * The on-chain `subscribe` and the signature itself are produced by
 * `@lumixa/chain`; here we only perform the authenticated HTTP exchange.
 *
 * @param baseUrl TxLINE base URL (the devnet/chain base for activation).
 * @param params jwt + txSig + leagues + walletSignature.
 * @param fetchImpl `fetch`-compatible function; defaults to global `fetch`.
 * @returns `{ apiToken }` to seed the `X-Api-Token` header.
 * @throws if the response omits a recognizable API-token field.
 */
export async function activateToken(
  baseUrl: string,
  params: ActivateTokenParams,
  fetchImpl: FetchImpl = fetch,
): Promise<ActivateTokenResult> {
  const raw = await requestJson(fetchImpl, activateTokenUrl(baseUrl), {
    method: 'POST',
    jwt: params.jwt,
    body: {
      txSig: params.txSig,
      leagues: params.leagues,
      walletSignature: params.walletSignature,
    },
  });
  const parsed = ActivateResponseSchema.parse(raw);
  const apiToken =
    parsed.apiToken ?? parsed.token ?? parsed.ApiToken ?? parsed.Token;
  if (apiToken === undefined) {
    throw new Error('activateToken: response did not contain an API token');
  }
  return { apiToken };
}
