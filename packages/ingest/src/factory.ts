import type { Config } from '@lumixa/core';
import { guestStart } from './auth.js';
import { TxlineClient } from './client.js';
import type { FetchImpl } from './http.js';

/**
 * Client factory helpers that wire a {@link TxlineClient} from a core
 * {@link Config}, choosing the right base URL and auth material.
 */

/**
 * Create a client backed by a fresh guest session: performs `guestStart`
 * against `config.txlineBase` (the WC free-tier production base) and seeds the
 * returned client with the new JWT. If `config.txlineApiToken` is already set,
 * it is attached too so the client can use the long-lived token where accepted.
 *
 * @param config parsed runtime config (provides base URLs + optional token).
 * @param fetchImpl `fetch`-compatible function; defaults to global `fetch`.
 */
export async function createGuestClient(
  config: Config,
  fetchImpl: FetchImpl = fetch,
): Promise<TxlineClient> {
  const { jwt } = await guestStart(config.txlineBase, fetchImpl);
  return new TxlineClient({
    baseUrl: config.txlineBase,
    jwt,
    apiToken: config.txlineApiToken,
    fetchImpl,
  });
}

/**
 * Create a client seeded directly from `config.txlineApiToken` with NO network
 * call. Uses the devnet/chain base (`config.txlineDevBase`), since the
 * long-lived API token is issued through the on-chain activation flow.
 *
 * @param config parsed runtime config; must have `txlineApiToken` set.
 * @param fetchImpl `fetch`-compatible function; defaults to global `fetch`.
 * @throws if `config.txlineApiToken` is not set.
 */
export function createTokenClient(
  config: Config,
  fetchImpl: FetchImpl = fetch,
): TxlineClient {
  if (config.txlineApiToken === undefined) {
    throw new Error('createTokenClient: config.txlineApiToken is not set');
  }
  return new TxlineClient({
    baseUrl: config.txlineDevBase,
    jwt: config.txlineJwt,
    apiToken: config.txlineApiToken,
    fetchImpl,
  });
}
