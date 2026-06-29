import { describe, it, expect } from 'vitest';
import { sha256Hex, verifyMerkleProof, type MerkleNode } from './merkle.js';

/** Build a parent hash the same way the verifier combines siblings. */
function parent(leftHex: string, rightHex: string): string {
  return sha256Hex(Buffer.concat([Buffer.from(leftHex, 'hex'), Buffer.from(rightHex, 'hex')]));
}

describe('verifyMerkleProof', () => {
  // A 4-leaf tree:
  //         root
  //        /    \
  //      h01    h23
  //     /  \    /  \
  //    L0  L1  L2  L3
  const [l0, l1, l2, l3] = ['leaf-0', 'leaf-1', 'leaf-2', 'leaf-3'].map((s) => sha256Hex(s));
  const h01 = parent(l0, l1);
  const h23 = parent(l2, l3);
  const root = parent(h01, h23);

  it('verifies a leaf with its sibling path to the root', () => {
    // Prove L0: sibling L1 (right), then sibling h23 (right).
    const proof: MerkleNode[] = [
      { hash: l1, isRightSibling: true },
      { hash: h23, isRightSibling: true },
    ];
    expect(verifyMerkleProof(l0, proof, root)).toBe(true);
  });

  it('honors sibling side (left vs right) — proves a right-hand leaf', () => {
    // Prove L3: sibling L2 (left), then sibling h01 (left).
    const proof: MerkleNode[] = [
      { hash: l2, isRightSibling: false },
      { hash: h01, isRightSibling: false },
    ];
    expect(verifyMerkleProof(l3, proof, root)).toBe(true);
  });

  it('rejects a tampered leaf', () => {
    const proof: MerkleNode[] = [
      { hash: l1, isRightSibling: true },
      { hash: h23, isRightSibling: true },
    ];
    expect(verifyMerkleProof(sha256Hex('not-leaf-0'), proof, root)).toBe(false);
  });

  it('rejects when a sibling side is flipped', () => {
    const proof: MerkleNode[] = [
      { hash: l1, isRightSibling: false }, // wrong side
      { hash: h23, isRightSibling: true },
    ];
    expect(verifyMerkleProof(l0, proof, root)).toBe(false);
  });

  it('is case-insensitive on hex input', () => {
    const proof: MerkleNode[] = [
      { hash: l1.toUpperCase(), isRightSibling: true },
      { hash: h23.toUpperCase(), isRightSibling: true },
    ];
    expect(verifyMerkleProof(l0.toUpperCase(), proof, root.toUpperCase())).toBe(true);
  });

  it('treats an empty proof as a single-leaf tree (leaf === root)', () => {
    expect(verifyMerkleProof(l0, [], l0)).toBe(true);
    expect(verifyMerkleProof(l0, [], root)).toBe(false);
  });
});
