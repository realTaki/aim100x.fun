import { it } from "node:test";
import assert from "node:assert/strict";
import type { EIP1193Provider, Hex } from "viem";
import { executeExternalCalls, externalSigningClient } from "./external-wallet.ts";
import { executePasskeyCalls } from "./passkey-userop.ts";
import { executeAgentCall } from "../mcp/userop.ts";
import { mainnetWalletChain, testnetWalletChain } from "./app-wallet-chain.ts";
import { LonelyFunsClient } from "../mcp/client.ts";
import type { McpAgentSession } from "../mcp/auth.server.ts";
const wallet = "0x1111111111111111111111111111111111111111" as const;
const forbidden = /authenticated APP wallet/;
it("external business execution rejects before touching the login provider, RPC or receipt callbacks", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    assert.fail("Must not call RPC");
  });
  const provider: EIP1193Provider = {
    on() {},
    removeListener() {},
    request: async () => {
      assert.fail("Must not request a wallet signature or account");
    },
  };
  for (const chain of [mainnetWalletChain, testnetWalletChain])
    await assert.rejects(externalSigningClient(wallet, chain, provider), forbidden);
  for (const calls of [[], [{ to: wallet, data: "0x" as Hex }]])
    await assert.rejects(
      executeExternalCalls(wallet, calls, {
        provider,
        waitForReceipt: async () => {
          assert.fail("Must not wait for a legacy transaction");
        },
        onSubmitted: () => {
          assert.fail("Must not submit a legacy transaction");
        },
      }),
      forbidden,
    );
});
it("legacy passkey and MCP executors cannot access key/session fields or submit UserOperations", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    assert.fail("Must not contact a bundler");
  });
  const session = new Proxy({} as McpAgentSession, {
    get() {
      assert.fail("Must not read an Agent key");
    },
  });
  await assert.rejects(executePasskeyCalls([{ to: wallet, data: "0x" }]), forbidden);
  await assert.rejects(executeAgentCall(session, "0x"), forbidden);
});
it("MCP price and sale writes fail before role/RPC checks while content authorization remains separate", async (t) => {
  t.mock.method(LonelyFunsClient.prototype, "getIdol", async () => {
    assert.fail("Disabled chain writes must not read roles or keys");
  });
  const client = Object.create(LonelyFunsClient.prototype) as LonelyFunsClient;
  await assert.rejects(client.updatePricing(1, { subscribePriceUsdc: "1" }), forbidden);
  await assert.rejects(client.setSalePrice(1, "20"), forbidden);
});
it("the public bundler proxy cannot submit a legacy UserOperation", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    assert.fail("Must not forward UserOperation");
  });
  const { Route } = await import("../../routes/api/bundler.ts");
  const options = Route.options as unknown as {
    server: { handlers: { POST(input: { request: Request }): Promise<Response> } };
  };
  const response = await options.server.handlers.POST({
    request: new Request("https://aim100x.fun/api/bundler", {
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_sendUserOperation", params: [] }),
    }),
  });
  assert.equal(response.status, 404);
});

it("wallet, Privy and Mera APP accounts execute via sponsor-submitted 7702 handleOps; retries do not sign again", async (t) => {
  const { createHash } = await import("node:crypto");
  const { deriveIdentityWallet } = await import("./app-wallet.server.ts");
  const { executeTestnetCalls } = await import("./product-wallet.server.ts");
  const { parseTransaction, recoverTransactionAddress, keccak256 } = await import("viem");
  const { privateKeyToAccount } = await import("viem/accounts");
  const { APP_ENTRY_POINT } = await import("./app-wallet-chain.ts");
  const { sponsoredCallFromHandleOps } = await import("./app-wallet-7702.ts");
  const estimatedGas = 200_000n;
  const sponsorKey = ("0x" + "22".repeat(32)) as Hex;
  const sponsor = privateKeyToAccount(sponsorKey);
  const keyBefore = process.env.WALLET_MASTER_SECRET,
    rpcBefore = process.env.ALCHEMY_MONAD_TESTNET_RPC_URL,
    payBefore = process.env.PAYMASTER_SIGNER;
  process.env.WALLET_MASTER_SECRET = "11".repeat(32);
  process.env.ALCHEMY_MONAD_TESTNET_RPC_URL =
    "https://monad-testnet.g.alchemy.com/v2/offline-fixture";
  process.env.PAYMASTER_SIGNER = sponsorKey;
  t.after(() => {
    for (const [key, previous] of [
      ["WALLET_MASTER_SECRET", keyBefore],
      ["ALCHEMY_MONAD_TESTNET_RPC_URL", rpcBefore],
      ["PAYMASTER_SIGNER", payBefore],
    ]) {
      if (previous === undefined) delete process.env[key!];
      else process.env[key!] = previous;
    }
  });
  let expected = wallet as `0x${string}`,
    nonce = 0,
    epNonce = 0,
    sent = 0;
  const transactions = new Map<string, { from: string; to: string; index: number }>();
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const rpc = JSON.parse(String(init.body));
    let result: unknown;
    if (rpc.method === "eth_chainId") result = "0x279f";
    else if (rpc.method === "eth_call") {
      const to = String(rpc.params[0].to ?? "").toLowerCase();
      if (to === APP_ENTRY_POINT.toLowerCase())
        result = `0x${epNonce.toString(16).padStart(64, "0")}`;
      else {
        if (rpc.params[0].from)
          assert.equal(rpc.params[0].from.toLowerCase(), expected.toLowerCase());
        result = "0x";
      }
    } else if (rpc.method === "eth_estimateGas") result = `0x${estimatedGas.toString(16)}`;
    else if (rpc.method === "eth_getTransactionCount") result = `0x${nonce.toString(16)}`;
    else if (rpc.method === "eth_getBlockByNumber")
      result = { baseFeePerGas: "0x1", number: "0x1" };
    else if (rpc.method === "eth_maxPriorityFeePerGas") result = "0x77359400";
    else if (rpc.method === "eth_sendRawTransaction") {
      const bytes = rpc.params[0];
      const tx = parseTransaction(bytes);
      assert.equal(
        (await recoverTransactionAddress({ serializedTransaction: bytes })).toLowerCase(),
        sponsor.address.toLowerCase(),
      );
      assert.notEqual(
        (await recoverTransactionAddress({ serializedTransaction: bytes })).toLowerCase(),
        expected.toLowerCase(),
      );
      assert.equal(tx.chainId, 10143);
      assert.equal(tx.to?.toLowerCase(), APP_ENTRY_POINT.toLowerCase());
      assert.equal(tx.value ?? 0n, 0n);
      assert.ok((tx.maxPriorityFeePerGas ?? 0n) > 0n);
      const inner = sponsoredCallFromHandleOps(tx.data!);
      assert.ok(inner);
      assert.equal(inner.sender.toLowerCase(), expected.toLowerCase());
      assert.equal(inner.to.toLowerCase(), wallet);
      assert.equal(inner.value, 0n);
      assert.equal(inner.beneficiary.toLowerCase(), sponsor.address.toLowerCase());
      assert.equal(tx.nonce, nonce++);
      epNonce++;
      result = keccak256(bytes);
      transactions.set(result as string, { from: sponsor.address, to: APP_ENTRY_POINT, index: sent++ });
    } else if (rpc.method === "eth_getTransactionReceipt") {
      const tx = transactions.get(rpc.params[0])!;
      result = {
        transactionHash: rpc.params[0],
        transactionIndex: "0x0",
        blockHash: "0x" + "22".repeat(32),
        blockNumber: "0x1",
        from: tx.from,
        to: tx.to,
        contractAddress: null,
        cumulativeGasUsed: "0x5208",
        gasUsed: "0x5208",
        effectiveGasPrice: "0x1",
        logs: [],
        logsBloom: "0x" + "00".repeat(256),
        status: "0x1",
        type: "0x2",
      };
    } else if (rpc.method === "eth_blockNumber") result = "0x1";
    else if (rpc.method === "eth_getCode") result = "0x";
    else assert.fail(`Unexpected RPC ${rpc.method}`);
    return Response.json({ jsonrpc: "2.0", id: 1, result });
  });
  const identities = [
    { provider: "wallet", issuer: "eip155", subject: wallet },
    { provider: "privy", issuer: "privy.io/test-app", subject: "did:privy:test" },
    { provider: "mera", issuer: "aim100x.fun", subject: wallet },
  ] as import("./identity.ts").LoginIdentity[];
  for (const identity of identities) {
    expected = deriveIdentityWallet(identity).account.address;
    assert.notEqual(expected.toLowerCase(), wallet);
    nonce = 0;
    epNonce = 0;
    const user = {
      identity,
      walletAddress: expected,
      id: createHash("sha256").update(JSON.stringify(identity)).digest("hex"),
      sessionId: "session",
      authenticatedAt: Date.now() / 1000,
    } as import("./wallet-auth.server.ts").SessionUser;
    let record: (import("./operation-runner.ts").OperationResult & { bodyHash: string }) | null =
      null;
    const store: import("./operation-runner.ts").OperationStore = {
      lookup: async () => record,
      lock: async () => true,
      begin: async () => {
        record = { bodyHash: "body", status: "pending", hashes: [] };
      },
      hashes: async (hashes) => {
        record!.hashes = hashes;
      },
      status: async (status) => {
        record!.status = status;
      },
      release: async () => {},
    };
    let sponsorships = 0,
      delegated = 0;
    const ports = {
      store,
      active: async () => true,
      delegate: async () => {
        delegated++;
      },
      reserve: async (address: `0x${string}`, _id: string, index: number, amount: bigint) => {
        assert.equal(address, expected);
        assert.equal(index, sponsorships++);
        assert.ok(amount > 0n);
      },
    };
    const plan = async () => [
      { to: wallet, data: "0x" as Hex, value: 0n },
      { to: wallet, data: "0x" as Hex, value: 0n },
    ];
    assert.equal(
      (await executeTestnetCalls(user, "request", "body", plan, ports)).status,
      "confirmed",
    );
    assert.equal(sponsorships, 2);
    assert.equal(delegated, 2);
    const before = sent;
    assert.equal(
      (await executeTestnetCalls(user, "request", "body", plan, ports)).status,
      "confirmed",
    );
    assert.equal(sent, before);
    assert.equal(sponsorships, 2);
    record = null;
    const revoked = await executeTestnetCalls(user, "revoked", "body", plan, {
      ...ports,
      active: async () => false,
    });
    assert.equal(revoked.status, "failed");
    assert.equal(sent, before);
    assert.equal(sponsorships, 2);
    record = null;
    const unfunded = await executeTestnetCalls(user, "unfunded", "body", plan, {
      ...ports,
      reserve: async () => {
        throw new Error("Platform allowance exhausted");
      },
    });
    assert.equal(unfunded.status, "failed");
    assert.equal(sent, before);
    await assert.rejects(
      executeTestnetCalls({ ...user, walletAddress: wallet }, "wrong", "body", plan, ports),
      /Wallet derivation changed/,
    );
    record = null;
    sponsorships = 0;
    const batched = await executeTestnetCalls(user, "image-batch", "image-body", plan, ports, {
      batch: true,
    });
    assert.equal(batched.status, "confirmed");
    assert.equal(batched.hashes.length, 1);
    assert.equal(sponsorships, 1);
  }
});
