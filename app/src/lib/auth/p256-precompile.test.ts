import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { IDOLS100X_RPC_URL } from "../idols100x.ts";
import { P256_VERIFIER } from "./passkey-aa.ts";

/** EIP-7951 hello-world vector (same 160-byte RIP-7212 layout). */
const VALID =
  "0x" +
  "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9" +
  "434287fa699ff2be2a4475ccd9c063d1a22a424b6ab357d9bb0b31f7a71307b9" +
  "be6af716032d408183c53f6f76945363144555fad2a5ff7854159166e52fc1d0" +
  "da3c553a4215893e6d95d5818df2519e13233a1e0e56e0ea7b4817a92a6973f9" +
  "d8c8877a49383e20c3fdc21d4e8e280ef1feeb72c333036770369a4387168d33";

const SUCCESS = "0x" + "00".repeat(31) + "01";

async function ethCall(data: string): Promise<string> {
  const res = await fetch(IDOLS100X_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: P256_VERIFIER, data }, "latest"],
    }),
  });
  if (!res.ok) throw new Error(`rpc http ${res.status}`);
  const body = (await res.json()) as { result?: string; error?: { message?: string } };
  if (body.error) throw new Error(body.error.message ?? "rpc error");
  if (typeof body.result !== "string") throw new Error("rpc missing result");
  return body.result;
}

describe("Monad P256VERIFY 0x0100", () => {
  it("points at the EIP-7951 precompile, not a Solidity verifier", () => {
    assert.equal(P256_VERIFIER.toLowerCase(), "0x0000000000000000000000000000000000000100");
  });

  it("returns 32-byte 1 for a valid signature on chain 10143", async (t) => {
    let result: string;
    try {
      result = await ethCall(VALID);
    } catch (err) {
      t.skip(`Monad RPC unreachable: ${err instanceof Error ? err.message : err}`);
      return;
    }
    assert.equal(result.toLowerCase(), SUCCESS);
  });

  it("returns empty for invalid input on chain 10143", async (t) => {
    let result: string;
    try {
      result = await ethCall(VALID.slice(0, -2) + "32");
    } catch (err) {
      t.skip(`Monad RPC unreachable: ${err instanceof Error ? err.message : err}`);
      return;
    }
    assert.equal(result, "0x");
  });
});
