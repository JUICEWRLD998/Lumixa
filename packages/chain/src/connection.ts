import { Connection } from '@solana/web3.js';
import type { Commitment } from '@solana/web3.js';

/**
 * Open a Solana JSON-RPC {@link Connection} to the given cluster endpoint.
 *
 * Thin wrapper so the rest of the package never constructs a `Connection`
 * directly — keeps the commitment default in one place and gives us a single
 * seam to swap in a mock connection for tests. The `rpcUrl` comes from
 * `Config.solanaRpc` (devnet for this project).
 *
 * @param rpcUrl     full RPC endpoint URL (http/https)
 * @param commitment confirmation level for reads/sends (default `'confirmed'`)
 */
export function getConnection(rpcUrl: string, commitment: Commitment = 'confirmed'): Connection {
  return new Connection(rpcUrl, commitment);
}
