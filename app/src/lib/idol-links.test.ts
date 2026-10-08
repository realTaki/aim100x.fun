import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { httpUrlOf, idolPublicPath, idolPublicUrl, twitterUrlOf } from "./idol-links.ts";

describe("idol public URL", () => {
  it("uses /idol/{tokenId} on the production origin", () => {
    assert.equal(idolPublicPath(1), "/idol/1");
    assert.equal(idolPublicUrl(1), "https://aim100x.fun/idol/1");
    assert.equal(idolPublicUrl(4), "https://aim100x.fun/idol/4");
  });
});

describe("httpUrlOf", () => {
  it("allows empty", () => {
    assert.equal(httpUrlOf(""), "");
    assert.equal(httpUrlOf("   "), "");
  });

  it("accepts http(s) and prefixes https when the scheme is missing", () => {
    assert.equal(httpUrlOf("https://natalie.example/"), "https://natalie.example/");
    assert.equal(httpUrlOf("natalie.example"), "https://natalie.example/");
  });

  it("rejects non-http schemes", () => {
    assert.equal(httpUrlOf("javascript:alert(1)"), "");
  });
});

describe("twitterUrlOf", () => {
  it("allows empty and accepts a handle or URL", () => {
    assert.equal(twitterUrlOf(""), "");
    assert.equal(twitterUrlOf("@natalie"), "https://x.com/natalie");
    assert.equal(twitterUrlOf("https://x.com/natalie"), "https://x.com/natalie");
  });
});
