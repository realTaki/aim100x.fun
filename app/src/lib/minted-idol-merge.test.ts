import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { expectedMintedTokenIds, mergeMintedIdolReads } from "@/lib/minted-idol-merge";

describe("expectedMintedTokenIds", () => {
  it("uses nextTokenId-1 and will not shrink below demo or previous ids", () => {
    assert.deepEqual(expectedMintedTokenIds(5), [1, 2, 3, 4]);
    assert.deepEqual(expectedMintedTokenIds(4, [], [1, 2, 3, 4]), [1, 2, 3, 4]);
    assert.deepEqual(expectedMintedTokenIds(5, [1, 2, 3, 4], [1, 2, 3]), [1, 2, 3, 4]);
  });
});

describe("mergeMintedIdolReads", () => {
  it("does not drop an idol when one chain read is missing", () => {
    const previous = [1, 2, 3, 4].map((tokenId) => ({ tokenId, name: `p${tokenId}` }));
    const fresh = [
      { tokenId: 1, name: "a" },
      { tokenId: 2, name: "b" },
      { tokenId: 3, name: "c" },
    ];
    assert.deepEqual(
      mergeMintedIdolReads([1, 2, 3, 4], [previous, fresh]).map((row) => row.tokenId),
      [1, 2, 3, 4],
    );
    assert.equal(
      mergeMintedIdolReads([1, 2, 3, 4], [previous, fresh]).find((row) => row.tokenId === 4)?.name,
      "p4",
    );
  });
});
