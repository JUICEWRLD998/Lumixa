import { createHash } from 'node:crypto';

/**
 * Client-side Merkle-proof verification — the "verify the odds proof against the
 * published root ourselves" path from `implementation.md` §8.
 *
 * The TxLINE proof bundle gives each step as `{ hash, isRightSibling }`: the
 * sibling node's hash and which side it sits on. Starting from the leaf, we fold
 * each sibling in (sha256 of the concatenated 32-byte digests, ordered by side)
 * and check the final digest equals the published root. No chain call, no trust
 * — pure, deterministic, and unit-testable.
 *
 * HONESTY: the exact on-the-wire byte encoding TxLINE uses to combine nodes is
 * not documented. We implement the standard convention — sibling hashes are
 * hex-encoded sha256 digests, combined as `sha256(left || right)` over their raw
 * bytes — and expose {@link sha256Hex} so a tree can be built with the same rule
 * the verifier checks. If the live feed differs, only the combine step here
 * changes; the call sites do not.
 */

/** One step in a Merkle proof: a sibling hash and which side it is on. */
export interface MerkleNode {
  /** hex-encoded sha256 digest of the sibling subtree */
  hash: string;
  /** true ⇒ this sibling is the RIGHT child (current node is the left) */
  isRightSibling: boolean;
}

/** Lowercase hex sha256 of a buffer or string — the leaf/parent hashing rule. */
export function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Combine a current node hash with one sibling, honoring its side, and return
 * the parent hash. `sha256(left-bytes || right-bytes)`.
 */
function combine(currentHex: string, node: MerkleNode): string {
  const current = Buffer.from(currentHex, 'hex');
  const sibling = Buffer.from(node.hash, 'hex');
  const [left, right] = node.isRightSibling ? [current, sibling] : [sibling, current];
  return createHash('sha256').update(Buffer.concat([left, right])).digest('hex');
}

/**
 * Verify a Merkle proof: fold `nodes` into `leafHash` and check the result
 * equals `root`. An empty proof verifies iff the leaf already IS the root (a
 * single-leaf tree). All hashes are lowercase hex strings.
 *
 * @param leafHash hex sha256 of the proven leaf
 * @param nodes    ordered sibling steps, leaf→root
 * @param root     hex sha256 of the published tree root
 * @returns whether the recomputed root matches (case-insensitive on hex)
 */
export function verifyMerkleProof(leafHash: string, nodes: readonly MerkleNode[], root: string): boolean {
  let acc = leafHash.toLowerCase();
  for (const node of nodes) {
    acc = combine(acc, { hash: node.hash.toLowerCase(), isRightSibling: node.isRightSibling });
  }
  return acc === root.toLowerCase();
}
