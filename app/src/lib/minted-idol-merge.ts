/** Token ids that should appear in the plaza catalog for a given on-chain nextTokenId. */
export function expectedMintedTokenIds(
  nextTokenId: number,
  previousIds: readonly number[] = [],
  demoIds: readonly number[] = [],
): number[] {
  const fromChain = Number.isFinite(nextTokenId) && nextTokenId > 1 ? nextTokenId - 1 : 0;
  const maxId = Math.max(fromChain, ...previousIds, ...demoIds, 0);
  if (maxId < 1) return [];
  return Array.from({ length: maxId }, (_, i) => i + 1);
}

/** Fresh chain reads win; keep previous/demo rows so a flaky RPC does not drop an idol. */
export function mergeMintedIdolReads<T extends { tokenId: number }>(
  expectedIds: readonly number[],
  layers: readonly (readonly T[])[],
): T[] {
  const byId = new Map<number, T>();
  for (const layer of layers) {
    for (const row of layer) byId.set(row.tokenId, row);
  }
  return expectedIds
    .map((id) => byId.get(id))
    .filter((row): row is T => Boolean(row));
}
