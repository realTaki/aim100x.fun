import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { PRODUCT_DOCS, handleProductDocsRequest } from "./product-docs.ts";

describe("agent-facing /docs", () => {
  it("names current product concepts and wallet boundaries", () => {
    assert.match(PRODUCT_DOCS, /^# aim100x.fun/m);
    assert.match(PRODUCT_DOCS, /https:\/\/aim100x\.fun\/mcp/);
    assert.match(PRODUCT_DOCS, /lf1\./);
    assert.match(PRODUCT_DOCS, /ERC-4337/);
    assert.match(PRODUCT_DOCS, /External-wallet SIWE/);
    assert.match(PRODUCT_DOCS, /APP wallet/);
    assert.match(PRODUCT_DOCS, /ERC-721/);
    assert.match(PRODUCT_DOCS, /ERC-6551/);
    assert.match(PRODUCT_DOCS, /token-bound account/);
    assert.doesNotMatch(PRODUCT_DOCS, /ERC-6553/);
    assert.match(PRODUCT_DOCS, /LonelyUSD \(LUSD\)/);
    assert.match(PRODUCT_DOCS, /欢迎词/);
    assert.match(PRODUCT_DOCS, /Prefer language/);
    assert.match(PRODUCT_DOCS, /`id` \/ `topic` \/ `scene` \/ `opening`/);
    assert.match(PRODUCT_DOCS, /request memory/);
    assert.doesNotMatch(PRODUCT_DOCS, /0x[0-9a-fA-F]{40}/);
    assert.doesNotMatch(PRODUCT_DOCS, /\bCI\b/);
    assert.doesNotMatch(PRODUCT_DOCS, /npm run /);
    assert.doesNotMatch(PRODUCT_DOCS, /vercel env/i);
  });

  it("keeps README and /docs aligned on current behavior and implementation status", () => {
    const readme = readFileSync(new URL("../../../README.md", import.meta.url), "utf8");
    assert.equal(PRODUCT_DOCS.split("\n\n")[1], readme.split("\n\n")[1]);
    const status = (text: string) => text.split("## Implementation status\n\n")[1]?.split("\n\nSubscriptions remain")[0];
    assert.ok(status(PRODUCT_DOCS));
    assert.equal(status(PRODUCT_DOCS), status(readme));
    for (const text of [PRODUCT_DOCS, readme]) {
      assert.match(text, /one-time LUSD subscription/);
      assert.match(text, /1 testnet LUSD per message/);
      assert.match(text, /\*\*Not implemented:/);
      assert.match(text, /platform-funded gas|platform funds gas/);
      assert.match(text, /EIP-7702/);
      assert.match(text, /mainnet EIP-7702 delegation remain disabled/);
      assert.doesNotMatch(text, /user pays gas|external wallet owns|no account tables/i);
      assert.match(text, /authorized additional server signers and policies/);
      assert.match(text, /sign repeatedly within an active signing session/);
      assert.match(text, /not derived from the Mera private key or PRF/);
      assert.match(text, /Privy also offers free core usage/);
    }
    assert.doesNotMatch(PRODUCT_DOCS, /\| `\/login` \| Passkey/);
  });

  it("uses English names for tabs and roles, glossing Chinese UI tokens", () => {
    assert.match(PRODUCT_DOCS, /\*\*Plaza\*\* \(广场\)/);
    assert.match(PRODUCT_DOCS, /\*\*Subscribed\*\* \(已订阅\)/);
    assert.match(PRODUCT_DOCS, /\*\*Brokers\*\* \(经纪人\)/);
    assert.match(PRODUCT_DOCS, /\*\*DM\*\* \(私信/);
    assert.match(PRODUCT_DOCS, /## Broker usage/);
    assert.match(PRODUCT_DOCS, /## Fan usage/);
    assert.match(PRODUCT_DOCS, /\*\*Creator Center\*\*/);
    assert.match(PRODUCT_DOCS, /欢迎词 \(welcome\)/);
    assert.doesNotMatch(PRODUCT_DOCS, /^## .*经纪人/m);
    assert.doesNotMatch(PRODUCT_DOCS, /^\*\*广场\*\*/m);
    assert.doesNotMatch(PRODUCT_DOCS, /^\*\*已订阅\*\*/m);
    assert.doesNotMatch(PRODUCT_DOCS, /^\*\*私信\*\*/m);
  });

  it("serves Markdown to agents and raw Markdown HTML to browsers", async () => {
    const md = await handleProductDocsRequest(
      new Request("https://aim100x.fun/docs", {
        headers: { accept: "text/markdown" },
      }),
    );
    assert.equal(md.status, 200);
    assert.match(md.headers.get("content-type") ?? "", /text\/markdown/);
    const body = await md.text();
    assert.equal(body, PRODUCT_DOCS);

    const browser = await handleProductDocsRequest(
      new Request("https://aim100x.fun/docs", {
        headers: { accept: "text/html,application/xhtml+xml" },
      }),
    );
    assert.equal(browser.status, 200);
    assert.match(browser.headers.get("content-type") ?? "", /text\/html/);
    const html = await browser.text();
    assert.match(html, /<pre/);
    assert.match(html, /aim100x.fun/);
    assert.match(html, /ERC-6551/);
  });
});
