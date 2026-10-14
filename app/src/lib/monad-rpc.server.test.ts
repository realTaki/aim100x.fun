import { it } from "node:test";
import assert from "node:assert/strict";
import { createPublicClient, createWalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  alchemyRpcUrl,
  alchemyRequest,
  handleRpcProxy,
  RpcConfigurationError,
  findRpcConfigurationError,
} from "./monad-rpc.server.ts";
import { monadTransport } from "./monad-rpc.ts";
import { testnetWalletChain } from "./auth/app-wallet-chain.ts";
import { RPC_MISSING_CONFIG, RPC_INVALID_CONFIG } from "./monad-rpc-policy.ts";

const endpoint = "https://monad-testnet.g.alchemy.com/v2/offline-fixture-key";
const env = { ALCHEMY_MONAD_TESTNET_RPC_URL: endpoint };
const json = (result: unknown) => Response.json({ jsonrpc: "2.0", id: 1, result });
const request = (method: string, params: unknown[] = [], chainId = 10143) =>
  new Request(`https://aim100x.fun/api/rpc?chainId=${chainId}`, {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id: 7, method, params }),
  });

it("requires the exact Alchemy testnet URL, with no public fallback or mainnet channel", () => {
  assert.equal(alchemyRpcUrl(10143, env), endpoint);
  assert.throws(() => alchemyRpcUrl(10143, {}), /ALCHEMY_MONAD_TESTNET_RPC_URL is required/);
  for (const url of [
    "https://rpc.monad.xyz",
    "https://monad-mainnet.g.alchemy.com/v2/fixture",
    `${endpoint}?key=fixture`,
    `${endpoint}#fixture`,
    "http://monad-testnet.g.alchemy.com/v2/fixture",
    "https://user:fixture@monad-testnet.g.alchemy.com/v2/fixture",
    "invalid-fixture",
  ]) {
    assert.throws(
      () => alchemyRpcUrl(10143, { ALCHEMY_MONAD_TESTNET_RPC_URL: url }),
      (error: unknown) => {
        assert.ok(error instanceof RpcConfigurationError);
        assert.equal(error.code, RPC_INVALID_CONFIG);
        assert.doesNotMatch(error.message, /fixture/);
        return true;
      },
    );
  }
  for (const chain of [143, 46630, 1]) {
    assert.throws(() => alchemyRpcUrl(chain, env), /disabled|Unsupported/);
    assert.throws(() => monadTransport(chain), /disabled|Unsupported/);
  }
});

it("probes chain 10143 before reads and broadcasts, without following redirects", async () => {
  const methods: string[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(url, endpoint);
    assert.equal(init?.redirect, "error");
    const body = JSON.parse(String(init?.body));
    methods.push(body.method);
    return json(body.method === "eth_chainId" ? "0x279f" : "0x1234");
  };
  assert.equal(await alchemyRequest(10143, { method: "eth_chainId" }, fetcher, env), "0x279f");
  assert.equal(
    await alchemyRequest(
      10143,
      { method: "eth_getBalance", params: ["0x" + "11".repeat(20), "latest"] },
      fetcher,
      env,
    ),
    "0x1234",
  );
  await alchemyRequest(
    10143,
    { method: "eth_sendRawTransaction", params: ["0xdeadbeef"] },
    fetcher,
    env,
  );
  assert.deepEqual(methods, [
    "eth_chainId",
    "eth_chainId",
    "eth_getBalance",
    "eth_chainId",
    "eth_sendRawTransaction",
  ]);
});

it("fails closed before reads/writes on wrong chain, malformed responses or absent configuration", async () => {
  for (const actual of ["0x8f", "0xb626", null, "not-hex", 10143]) {
    for (const method of ["eth_call", "eth_sendRawTransaction"]) {
      const methods: string[] = [];
      await assert.rejects(
        alchemyRequest(
          10143,
          { method },
          async (_url, init) => {
            methods.push(JSON.parse(String(init?.body)).method);
            return json(actual);
          },
          env,
        ),
        /chain mismatch/,
      );
      assert.deepEqual(methods, ["eth_chainId"]);
    }
  }
  const noFetch: typeof fetch = async () => {
    assert.fail("Unexpected network request");
  };
  await assert.rejects(
    alchemyRequest(10143, { method: "eth_chainId" }, noFetch, {}),
    /is required/,
  );
  await assert.rejects(
    alchemyRequest(143, { method: "eth_sendRawTransaction" }, noFetch, env),
    /disabled/,
  );
  for (const method of [
    "eth_sendUserOperation",
    "pm_sponsorUserOperation",
    "eth_sign",
    "eth_sendTransaction",
  ])
    await assert.rejects(alchemyRequest(10143, { method }, noFetch, env), /Unsupported.*method/);
  for (const body of [{ result: "0x279f" }, { jsonrpc: "2.0", id: 2, result: "0x279f" }, null])
    await assert.rejects(
      alchemyRequest(10143, { method: "eth_chainId" }, async () => Response.json(body), env),
      /unavailable/,
    );
});

it("never exposes upstream URLs or keys, while preserving bounded revert bytes for server callers", async () => {
  const secret = "https://monad-testnet.g.alchemy.com/v2/not-a-real-secret";
  await assert.rejects(
    alchemyRequest(
      10143,
      { method: "eth_chainId" },
      async () => {
        throw new Error(secret);
      },
      env,
    ),
    (error: unknown) => {
      assert.doesNotMatch(String(error), /not-a-real-secret/);
      return true;
    },
  );
  await assert.rejects(
    alchemyRequest(
      10143,
      { method: "eth_call" },
      async (_url, init) =>
        JSON.parse(String(init?.body)).method === "eth_chainId"
          ? json("0x279f")
          : Response.json({ error: { code: 3, message: secret, data: "0xdeadbeef" } }),
      env,
    ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.doesNotMatch(error.message, /not-a-real-secret/);
      assert.equal((error as Error & { data: string }).data, "0xdeadbeef");
      return true;
    },
  );
});

it("browser RPC forwards only bounded reads on 10143 and rejects malformed requests", async () => {
  let calls = 0;
  const rpc = async (chain: number) => {
    calls++;
    assert.equal(chain, 10143);
    return "0x279f";
  };
  assert.equal((await handleRpcProxy(request("eth_chainId"), rpc)).status, 200);
  for (const method of [
    "eth_sendRawTransaction",
    "eth_sendTransaction",
    "eth_sign",
    "eth_sendUserOperation",
    "pm_sponsorUserOperation",
    "eth_getLogs",
  ])
    assert.equal((await handleRpcProxy(request(method), rpc)).status, 400);
  for (const chain of [143, 46630, 1])
    assert.equal((await handleRpcProxy(request("eth_chainId", [], chain), rpc)).status, 400);
  for (const [fromBlock, toBlock] of [
    ["0x2", "0x1"],
    ["0x1", "0x7d2"],
  ])
    assert.equal(
      (
        await handleRpcProxy(
          request("eth_getLogs", [{ address: "0x" + "11".repeat(20), fromBlock, toBlock }]),
          rpc,
        )
      ).status,
      400,
    );
  for (const body of [
    "null",
    "[]",
    "{",
    JSON.stringify({ jsonrpc: "2.0", id: {}, method: "eth_chainId" }),
  ])
    assert.equal(
      (
        await handleRpcProxy(
          new Request("https://aim100x.fun/api/rpc?chainId=10143", { method: "POST", body }),
          rpc,
        )
      ).status,
      400,
    );
  assert.equal(calls, 1);
  const logs = await handleRpcProxy(
    request("eth_getLogs", [
      { address: "0x" + "11".repeat(20), fromBlock: "0x1", toBlock: "0x7d1" },
    ]),
    rpc,
  );
  assert.equal(logs.status, 200);
});

it("returns clear sanitized configuration errors and generic upstream errors with no cache", async () => {
  for (const code of [RPC_MISSING_CONFIG, RPC_INVALID_CONFIG]) {
    const response = await handleRpcProxy(request("eth_chainId"), async () => {
      throw new RpcConfigurationError(code);
    });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    assert.equal(body.id, 7);
    assert.equal(body.error.code, code);
    assert.match(body.error.message, /ALCHEMY_MONAD_TESTNET_RPC_URL/);
  }
  const response = await handleRpcProxy(request("eth_chainId"), async () => {
    throw new Error(endpoint);
  });
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /offline-fixture-key/);
  assert.ok(
    findRpcConfigurationError(
      new Error("wrapped", { cause: new RpcConfigurationError(RPC_MISSING_CONFIG) }),
    ),
  );
});

it("viem server reads and signed testnet writes use Alchemy; missing config survives viem wrapping", async (t) => {
  // Synthetic local fixture only: no external request or real credential is used.
  const previous = process.env.ALCHEMY_MONAD_TESTNET_RPC_URL;
  t.after(() => {
    if (previous === undefined) delete process.env.ALCHEMY_MONAD_TESTNET_RPC_URL;
    else process.env.ALCHEMY_MONAD_TESTNET_RPC_URL = previous;
  });
  process.env.ALCHEMY_MONAD_TESTNET_RPC_URL = endpoint;
  const methods: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    assert.equal(url, endpoint);
    const body = JSON.parse(String(init.body));
    methods.push(body.method);
    return json(
      body.method === "eth_chainId"
        ? "0x279f"
        : body.method === "eth_getBalance"
          ? "0x2a"
          : "0x" + "ab".repeat(32),
    );
  });
  const account = privateKeyToAccount(`0x${"01".repeat(32)}`);
  const reader = createPublicClient({
    chain: testnetWalletChain,
    transport: monadTransport(10143),
  });
  assert.equal(await reader.getBalance({ address: account.address }), 42n);
  const wallet = createWalletClient({
    account,
    chain: testnetWalletChain,
    transport: monadTransport(10143),
  });
  const signedTransaction = await account.signTransaction({
    chainId: 10143,
    to: account.address,
    value: 0n,
    gas: 21000n,
    gasPrice: 1n,
    nonce: 0,
  });
  await wallet.sendRawTransaction({ serializedTransaction: signedTransaction });
  assert.deepEqual(methods, [
    "eth_chainId",
    "eth_getBalance",
    "eth_chainId",
    "eth_sendRawTransaction",
  ]);
  delete process.env.ALCHEMY_MONAD_TESTNET_RPC_URL;
  await assert.rejects(reader.getBalance({ address: account.address }), (error: unknown) =>
    Boolean(findRpcConfigurationError(error)),
  );
});
