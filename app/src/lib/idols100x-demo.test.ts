import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  IDOLS100X_DEMO_FIELDS,
  IDOLS100X_DEMO_TOKEN_IDS,
  IDOLS100X_DEMO_TWITTER,
  IDOLS100X_DEMO_VOICE,
  IDOLS100X_DEMO_WEBSITE,
} from "./idols100x.ts";
import { mintedIdolsFromConstants } from "./idols100x-chain.server.ts";

describe("IDOLS100X_DEMO_FIELDS", () => {
  it("uses internet handles, not given-name + surname", () => {
    assert.deepEqual([...IDOLS100X_DEMO_TOKEN_IDS], [1, 2, 3, 4]);
    assert.equal(IDOLS100X_DEMO_FIELDS[1].name, "Natalie100x");
    assert.equal(IDOLS100X_DEMO_FIELDS[2].name, "moonlit_only");
    assert.equal(IDOLS100X_DEMO_FIELDS[3].name, "afterhoursx");
    assert.equal(IDOLS100X_DEMO_FIELDS[4].name, "waiteduh");
    const copied = new Set(["pupuwaifu", "noa_onlyonly", "spoilprincessjo"]);
    for (const tokenId of IDOLS100X_DEMO_TOKEN_IDS) {
      const { name, bio, website, twitter, voice } = IDOLS100X_DEMO_FIELDS[tokenId];
      assert.match(bio, /^[ -~]+$/);
      assert.equal(/\s/.test(name), false);
      assert.equal(copied.has(name), false);
      assert.equal(website, IDOLS100X_DEMO_WEBSITE);
      assert.equal(twitter, IDOLS100X_DEMO_TWITTER);
      assert.equal(voice, IDOLS100X_DEMO_VOICE);
      assert.notEqual(voice, "eve");
    }
  });

  it("fills catalog fallback names when RPC is down", () => {
    const minted = mintedIdolsFromConstants();
    assert.deepEqual(
      minted.map((token) => token.name),
      ["Natalie100x", "moonlit_only", "afterhoursx", "waiteduh"],
    );
    assert.equal(minted[0]?.bio, "up this late for me? stay.");
    assert.equal(minted[0]?.welcome, "感谢你订阅我。这么晚还来，我等好久了。");
    for (const token of minted) {
      assert.equal(token.website, IDOLS100X_DEMO_WEBSITE);
      assert.equal(token.twitter, IDOLS100X_DEMO_TWITTER);
      assert.equal(token.voice, IDOLS100X_DEMO_VOICE);
    }
  });
});
