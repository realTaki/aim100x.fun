import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AMATEUR_AVATAR_SRC,
  AMATEUR_BANNER_SRC,
  AMATEUR_MINT_FAIL_MS,
  AMATEUR_NAME,
  DEFAULT_AMATEUR_SALE_USDC,
  MAX_IDOL_SUPPLY,
  MAX_MINTS_PER_ACCOUNT,
  amateurMintBio,
  amateurMintIdol,
  canMintAmateur,
  isUnsoldAmateur,
  publicPlazaIdols,
  pickBuyableAmateur,
  sortPlazaIdols,
  subscribedIdolsFromCatalog,
} from "./idol-amateur.ts";
import {
  DEFAULT_SALE_PRICE_USDC_ATOMIC,
  IDOLS100X_ADDRESS,
  IDOLS100X_MINTER,
} from "./idols100x.ts";

const NFT = IDOLS100X_ADDRESS;
const BROKER = "0xe541ba52e2eff4fec12441c77f73352d885e183a";
const DEPLOYER = IDOLS100X_MINTER;

describe("publicPlazaIdols", () => {
  it("keeps public sold idols and drops contract-owned 素人", () => {
    const idols = [
      { tokenId: 1, isPublic: true, name: "Natalie100x" },
      { tokenId: 2, isPublic: true, name: "moonlit_only" },
      { tokenId: 3, isPublic: false, name: "afterhoursx" },
      { tokenId: 4, isPublic: true, name: "waiteduh" },
      { tokenId: 5, isPublic: true, name: "sold" },
    ];
    const owners = new Map<number, string | null>([
      [1, DEPLOYER],
      [2, DEPLOYER],
      [3, DEPLOYER],
      [4, DEPLOYER],
      [5, BROKER],
    ]);
    assert.deepEqual(
      publicPlazaIdols(idols, owners, NFT).map((i) => i.tokenId),
      [1, 2, 4, 5],
    );
  });

  it("shows the default four on plaza when public and owned by the deployer", () => {
    const idols = [
      { tokenId: 1, isPublic: true, name: "Natalie100x" },
      { tokenId: 2, isPublic: true, name: "moonlit_only" },
      { tokenId: 3, isPublic: true, name: "afterhoursx" },
      { tokenId: 4, isPublic: true, name: "waiteduh" },
    ];
    const owners = new Map<number, string | null>([
      [1, DEPLOYER],
      [2, DEPLOYER.toLowerCase()],
      [3, DEPLOYER],
      [4, DEPLOYER],
    ]);
    assert.deepEqual(
      publicPlazaIdols(idols, owners, NFT).map((i) => i.tokenId),
      [1, 2, 3, 4],
    );
  });

  it("hides only true unsold-at-contract 素人", () => {
    const idols = [
      { tokenId: 1, isPublic: true, name: "Natalie100x" },
      { tokenId: 5, isPublic: true, name: "素人" },
    ];
    const owners = new Map<number, string | null>([
      [1, DEPLOYER],
      [5, NFT],
    ]);
    assert.deepEqual(
      publicPlazaIdols(idols, owners, NFT).map((i) => i.tokenId),
      [1],
    );
  });
});

describe("subscribedIdolsFromCatalog", () => {
  it("keeps subscribed unsold 素人 and hidden idols that plaza hides", () => {
    const idols = [
      { tokenId: 1, isPublic: true, name: "Natalie100x" },
      { tokenId: 2, isPublic: true, name: "moonlit_only" },
      { tokenId: 3, isPublic: false, name: "afterhoursx" },
      { tokenId: 4, isPublic: true, name: "waiteduh" },
      { tokenId: 5, isPublic: true, name: "sold" },
    ];
    const owners = new Map<number, string | null>([
      [1, NFT],
      [2, NFT],
      [3, NFT],
      [4, NFT],
      [5, BROKER],
    ]);
    assert.deepEqual(publicPlazaIdols(idols, owners, NFT).map((i) => i.tokenId), [5]);
    assert.deepEqual(
      subscribedIdolsFromCatalog(idols, [1, 3, 5]).map((i) => i.name),
      ["Natalie100x", "afterhoursx", "sold"],
    );
  });

  it("preserves subscribedIdsOf order and drops unknown ids", () => {
    const idols = [
      { tokenId: 4, isPublic: true, name: "waiteduh" },
      { tokenId: 1, isPublic: true, name: "Natalie100x" },
    ];
    assert.deepEqual(
      subscribedIdolsFromCatalog(idols, [1, 99, 4, 1]).map((i) => i.tokenId),
      [1, 4],
    );
  });
});

describe("amateurMintIdol", () => {
  it("uses generated default art, name mint new idol, and (x/4) bio", () => {
    assert.equal(AMATEUR_MINT_FAIL_MS, 2000);
    assert.equal(AMATEUR_NAME, "mint new idol");
    assert.equal(amateurMintBio(0), "click to mint new idol (0/4)");
    assert.equal(amateurMintBio(1), "click to mint new idol (1/4)");
    assert.equal(amateurMintBio(3), "click to mint new idol (3/4)");
    assert.equal(amateurMintBio(4), "click to mint new idol (4/4)");
    assert.equal(amateurMintBio(-1), "click to mint new idol (0/4)");
    assert.equal(AMATEUR_AVATAR_SRC, "/new-idol-avatar.jpg");
    assert.equal(AMATEUR_BANNER_SRC, "/new-idol-banner.jpg");
    const card = amateurMintIdol({
      salePriceUsdc: DEFAULT_AMATEUR_SALE_USDC,
      mintsOf: 2,
    });
    assert.equal(card.name, AMATEUR_NAME);
    assert.equal(card.bio, "click to mint new idol (2/4)");
    assert.equal(card.avatar, AMATEUR_AVATAR_SRC);
    assert.equal(card.banner, AMATEUR_BANNER_SRC);
    assert.equal(card.salePriceUsdc, 20);
    assert.equal(card.tokenId, 0);
  });
});

describe("canMintAmateur", () => {
  it("allows mint under the per-account and supply caps", () => {
    assert.equal(MAX_MINTS_PER_ACCOUNT, 4);
    assert.equal(MAX_IDOL_SUPPLY, 100);
    assert.equal(canMintAmateur(0, 1), true);
    assert.equal(canMintAmateur(3, 100), true);
    assert.equal(canMintAmateur(4, 5), false);
    assert.equal(canMintAmateur(0, 101), false);
    assert.equal(canMintAmateur(0, 0), false);
  });
});

describe("sortPlazaIdols", () => {
  const idols = [
    { tokenId: 2, subscriberCount: 3, receiptsUsdc: 10 },
    { tokenId: 1, subscriberCount: 3, receiptsUsdc: 40 },
    { tokenId: 4, subscriberCount: 1, receiptsUsdc: 99 },
    { tokenId: 3, subscriberCount: 8, receiptsUsdc: 5 },
  ];

  it("sorts by subscriberCount, then tokenId", () => {
    assert.deepEqual(
      sortPlazaIdols(idols, "subscribers").map((i) => i.tokenId),
      [3, 1, 2, 4],
    );
  });

  it("sorts by receiptsUsdc, then tokenId", () => {
    assert.deepEqual(
      sortPlazaIdols(idols, "receipts").map((i) => i.tokenId),
      [4, 1, 2, 3],
    );
  });
});

describe("pickBuyableAmateur", () => {
  it("picks the lowest-id contract-owned token with a sale price", () => {
    assert.equal(DEFAULT_AMATEUR_SALE_USDC, 20);
    assert.equal(Number(DEFAULT_SALE_PRICE_USDC_ATOMIC), 20_000_000);
    const next = pickBuyableAmateur(
      [
        { tokenId: 5, owner: NFT, salePriceUsdc: 0 },
        { tokenId: 8, owner: NFT, salePriceUsdc: DEFAULT_AMATEUR_SALE_USDC },
        { tokenId: 6, owner: NFT, salePriceUsdc: DEFAULT_AMATEUR_SALE_USDC },
        { tokenId: 7, owner: BROKER, salePriceUsdc: DEFAULT_AMATEUR_SALE_USDC },
      ],
      NFT,
    );
    assert.equal(next?.tokenId, 6);
  });

  it("returns undefined when no unsold mint is for sale", () => {
    assert.equal(
      pickBuyableAmateur([{ tokenId: 1, owner: BROKER, salePriceUsdc: 20 }], NFT),
      undefined,
    );
    assert.equal(
      pickBuyableAmateur([{ tokenId: 1, owner: DEPLOYER, salePriceUsdc: 20 }], NFT),
      undefined,
    );
  });
});
