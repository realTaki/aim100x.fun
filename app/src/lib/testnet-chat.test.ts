import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  encodeAbiParameters,
  encodeEventTopics,
  erc20Abi,
  type Hex,
  type Address,
  decodeFunctionData,
} from "viem";
import { runTestnetText, type TextStore, type TextRecord } from "./testnet-chat-runner.ts";
import { verifyTextPayment, type PaymentEvidence } from "./testnet-chat-receipt.ts";
import { textPaymentCall, TEXT_CHAT_COST } from "./testnet-chat-policy.ts";
import { LONELY_USD_ADDRESS } from "./idols100x.ts";
import { planProductAction, type PolicyReader } from "./auth/product-policy.server.ts";
import { LONELY_USD_ABI, LONELY_USD_FAUCET_AMOUNT } from "./lonely-usd.ts";
import { minimaxText } from "./minimax-text.server.ts";
import { gasBudget, sponsorshipId } from "./auth/testnet-gas.server.ts";
import { pendingTextRequest } from "./text-request.ts";
const wallet = "0x1111111111111111111111111111111111111111" as Address;
const recipient = "0x2222222222222222222222222222222222222222" as Address;
const hash = ("0x" + "33".repeat(32)) as Hex,
  block = ("0x" + "44".repeat(32)) as Hex;
const id = "11111111-1111-4111-a111-111111111111",
  body = "content-hash";
function evidence(requestId = id, bodyHash = body): PaymentEvidence {
  const call = textPaymentCall(wallet, recipient, requestId, bodyHash);
  return {
    chainId: 10143,
    transaction: {
      hash,
      from: wallet,
      to: LONELY_USD_ADDRESS,
      input: call.data,
      value: 0n,
      chainId: 10143,
      blockHash: block,
    },
    receipt: {
      transactionHash: hash,
      status: "success",
      from: wallet,
      to: LONELY_USD_ADDRESS,
      blockHash: block,
      logs: [
        {
          address: LONELY_USD_ADDRESS,
          data: encodeAbiParameters([{ type: "uint256" }], [TEXT_CHAT_COST]),
          topics: encodeEventTopics({
            abi: erc20Abi,
            eventName: "Transfer",
            args: { from: wallet, to: recipient },
          }) as Hex[],
        },
      ],
    },
  };
}
function memoryStore() {
  const records = new Map<string, TextRecord>(),
    locks = new Set<string>();
  const store: TextStore = {
    async open(requestId, bodyHash) {
      let r = records.get(requestId) ?? [...records.values()].find((r) => r.bodyHash === bodyHash);
      if (!r) {
        r = { requestId, bodyHash, status: "unpaid", paymentHash: null, reply: null, attempts: 0 };
        records.set(requestId, r);
      }
      return structuredClone(r);
    },
    async lock(id) {
      if (locks.has(id)) return false;
      locks.add(id);
      return true;
    },
    async save(r) {
      records.set(r.requestId, structuredClone(r));
    },
    async release(id) {
      locks.delete(id);
    },
  };
  return { store, records, locks };
}
function setup() {
  const f = memoryStore();
  let payments = 0,
    models = 0;
  const deps = {
    configured: async () => {},
    pay: async () => {
      payments++;
      return { status: "confirmed" as const, hashes: [hash] };
    },
    verify: async (h: Hex, rid: string) =>
      verifyTextPayment(evidence(rid), h, wallet, recipient, rid, body),
    model: async () => {
      models++;
      return "Hello from China API";
    },
  };
  return { ...f, deps, counts: () => ({ payments, models }) };
}
it("zero LUSD: refuses chat, existing faucet mints to caller, then exact chain payment permits text", async () => {
  const f = setup();
  let balance = 0n,
    charges = 0;
  f.deps.pay = async () => {
    if (balance < TEXT_CHAT_COST) throw new Error("Claim faucet");
    balance -= TEXT_CHAT_COST;
    charges++;
    return { status: "confirmed", hashes: [hash] };
  };
  await assert.rejects(runTestnetText(id, body, f.store, f.deps), /Claim faucet/);
  assert.equal(f.counts().models, 0);
  const [call] = await planProductAction({ kind: "faucet" }, wallet, {} as PolicyReader);
  assert.equal(call.to, LONELY_USD_ADDRESS);
  assert.equal(call.value, 0n);
  assert.equal(decodeFunctionData({ abi: LONELY_USD_ABI, data: call.data }).functionName, "faucet");
  // Mock chain: receipt-confirmed faucet gives its authenticated caller 100 LUSD.
  balance += LONELY_USD_FAUCET_AMOUNT;
  assert.equal((await runTestnetText(id, body, f.store, f.deps)).ok, true);
  assert.equal(balance, 99_000_000n);
  assert.equal(charges, 1);
  assert.equal(f.counts().models, 1);
});
it("cached success and concurrent duplicate IDs/content never charge or call model twice", async () => {
  const f = setup();
  let finish!: () => void;
  const wait = new Promise<void>((r) => {
    finish = r;
  });
  f.deps.model = async () => {
    await wait;
    return "reply";
  };
  const first = runTestnetText(id, body, f.store, f.deps);
  await new Promise((r) => setImmediate(r));
  const other = await runTestnetText("22222222-2222-4222-a222-222222222222", body, f.store, f.deps);
  assert.equal(other.ok, false);
  assert.equal(f.counts().payments, 1);
  finish();
  assert.equal((await first).ok, true);
  assert.equal((await runTestnetText(id, body, f.store, f.deps)).ok, true);
  assert.equal(f.counts().payments, 1);
  await assert.rejects(runTestnetText(id, "changed", f.store, f.deps), /different content/);
});
it("model failure is explicit and retries reuse verified payment with a bounded attempt count", async () => {
  const f = setup();
  let attempts = 0;
  f.deps.model = async () => {
    attempts++;
    throw new Error("provider key must not leak");
  };
  for (let i = 0; i < 4; i++) {
    const result = await runTestnetText(id, body, f.store, f.deps);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.charged, true);
      assert.doesNotMatch(result.error, /key must not leak/);
    }
  }
  assert.equal(f.counts().payments, 1);
  assert.equal(attempts, 3);
  const g = setup();
  g.deps.model = async () => {
    throw new Error("timeout");
  };
  await runTestnetText(id, body, g.store, g.deps);
  g.deps.model = async () => "recovered";
  assert.equal((await runTestnetText(id, body, g.store, g.deps)).ok, true);
  assert.equal(g.counts().payments, 1);
});
it("missing configuration, forged evidence and pending receipts never call the model", async () => {
  const f = setup();
  f.deps.configured = async () => {
    throw new Error("missing config");
  };
  await assert.rejects(runTestnetText(id, body, f.store, f.deps));
  assert.deepEqual(f.counts(), { payments: 0, models: 0 });
  const g = setup();
  g.deps.verify = async () => {
    throw new Error("forged proof");
  };
  await assert.rejects(runTestnetText(id, body, g.store, g.deps));
  assert.equal(g.counts().models, 0);
  const h = setup();
  const result = await runTestnetText(id, body, h.store, {
    ...h.deps,
    pay: async () => ({ status: "pending", hashes: [hash] }),
  });
  assert.equal(result.ok, false);
  assert.equal(h.counts().models, 0);
});
it("crashed generating request and locked row cannot silently launch another model/payment", async () => {
  const f = setup();
  f.records.set(id, {
    requestId: id,
    bodyHash: body,
    status: "generating",
    paymentHash: hash,
    reply: null,
    attempts: 1,
  });
  assert.equal((await runTestnetText(id, body, f.store, f.deps)).ok, false);
  assert.deepEqual(f.counts(), { payments: 0, models: 0 });
});
it("rejects mainnet, wrong sender/recipient/token/amount/tag, reverted and forged receipts", () => {
  const good = evidence();
  verifyTextPayment(good, hash, wallet, recipient, id, body);
  const mutations: ((e: PaymentEvidence) => void)[] = [
    (e) => {
      e.chainId = 143;
    },
    (e) => {
      e.transaction.chainId = 143;
    },
    (e) => {
      e.transaction.from = recipient;
    },
    (e) => {
      e.receipt.status = "reverted";
    },
    (e) => {
      e.transaction.to = recipient;
    },
    (e) => {
      e.transaction.value = 1n;
    },
    (e) => {
      e.transaction.input = textPaymentCall(wallet, wallet, id, body).data;
    },
    (e) => {
      e.transaction.input = textPaymentCall(wallet, recipient, "replay", body).data;
    },
    (e) => {
      e.receipt.logs = [{ ...e.receipt.logs[0], address: recipient }];
    },
    (e) => {
      e.receipt.logs = [
        { ...e.receipt.logs[0], data: encodeAbiParameters([{ type: "uint256" }], [1n]) },
      ];
    },
    (e) => {
      e.receipt.logs = [];
    },
    (e) => {
      e.transaction.blockHash = null;
    },
    (e) => {
      e.receipt.transactionHash = block;
    },
  ];
  for (const change of mutations) {
    const e = structuredClone(good);
    change(e);
    assert.throws(() => verifyTextPayment(e, hash, wallet, recipient, id, body));
  }
  assert.throws(() => verifyTextPayment(good, hash, recipient, recipient, id, body));
  assert.throws(() => verifyTextPayment(good, hash, wallet, recipient, id, "other message"));
});
it("direct CN model request never visits mainnet, Hub, Monid or speech/image APIs", async () => {
  let calls = 0;
  const result = await minimaxText(
    [{ role: "user", content: "hi" }],
    "fixture-key",
    async (url, init) => {
      calls++;
      assert.equal(url, "https://api.minimax.cn/v1/chat/completions");
      assert.equal(init?.redirect, "error");
      const body = JSON.parse(init!.body as string);
      assert.equal(body.model, "MiniMax-M3");
      assert.deepEqual(body.thinking, { type: "disabled" });
      assert.equal(body.tools, undefined);
      assert.equal(body.stream, false);
      return Response.json({
        choices: [{ message: { content: "<think>private</think>Hello" } }],
        base_resp: { status_code: 0 },
      });
    },
  );
  assert.equal(result, "Hello");
  assert.equal(calls, 1);
  await assert.rejects(
    minimaxText([], "fixture", async () => Response.json({ base_resp: { status_code: 1004 } })),
  );
});
it("testnet text chat stays on MiniMax CN and does not select x402 Kimi", () => {
  const src = readFileSync(new URL("./testnet-chat.server.ts", import.meta.url), "utf8");
  assert.match(src, /from "\.\/minimax-text\.server\.ts"/);
  assert.match(src, /minimaxText\(/);
  assert.doesNotMatch(src, /monadChatPayload|MONAD_KIMI|moonshot\/kimi-k3|BLOCKRUN_CHAT_URL|postPaidAi/);
});
it("gas policy caps sponsorship and derives a stable wallet-scoped funding ID", () => {
  assert.equal(gasBudget(1n).gas, 300_000n);
  assert.throws(() => gasBudget(200_000_000_000n));
  assert.equal(sponsorshipId(wallet, id, 0), sponsorshipId(wallet, id, 0));
  assert.notEqual(sponsorshipId(wallet, id, 0), sponsorshipId(recipient, id, 0));
});
it("client retries preserve message ID and original context across changed thread history", () => {
  const map = new Map<string, string>(),
    storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
      removeItem: (k: string) => {
        map.delete(k);
      },
    };
  const first = pendingTextRequest(
    storage,
    "account",
    1,
    { content: "hello", history: ["original"] },
    () => id,
  );
  const retry = pendingTextRequest(
    storage,
    "account",
    1,
    { content: "hello", history: ["changed"] },
    () => "must not use",
  );
  assert.deepEqual(retry, first);
  assert.throws(
    () =>
      pendingTextRequest(storage, "account", 1, { content: "different", history: [] }, () => "no"),
    /previous message/,
  );
  assert.notEqual(
    pendingTextRequest(
      storage,
      "other account",
      1,
      { content: "hello", history: [] },
      () => "other",
    ).key,
    first.key,
  );
});
it("platform funds gas for an empty APP wallet, preserves hash before broadcast and never funds a retry twice", async () => {
  const { fundTestnetGas } = await import("./auth/testnet-gas.server.ts");
  let row: (import("./auth/operation-runner.ts").OperationResult & { bodyHash: string }) | null =
    null;
  let balance = 0n,
    locked = false,
    sends = 0,
    reserves = 0,
    value = 0n;
  const ports: import("./auth/testnet-gas.server.ts").GasPorts = {
    chainId: async () => 10143,
    baseFee: async () => 1n,
    balance: async () => balance,
    sponsor: recipient,
    store: (_id, bodyHash) => ({
      lookup: async () => row,
      lock: async () => {
        if (locked) return false;
        locked = true;
        return true;
      },
      begin: async () => {
        row = { bodyHash, status: "pending", hashes: [] };
      },
      hashes: async (h) => {
        row!.hashes = h;
      },
      status: async (s) => {
        row!.status = s;
      },
      release: async () => {
        locked = false;
      },
    }),
    reserve: async (to, _id, amount) => {
      assert.equal(to, wallet);
      assert.ok(amount > 0n);
      reserves++;
    },
    sign: async (to, amount) => {
      assert.equal(to, wallet);
      value = amount;
      return hash;
    },
    send: async () => {
      assert.deepEqual(row!.hashes, [hash]);
      balance += value;
      sends++;
    },
    confirmed: async () => true,
  };
  const funded = await fundTestnetGas(wallet, id, 0, ports);
  assert.equal(balance, funded.gas * funded.maxFeePerGas);
  await fundTestnetGas(wallet, id, 0, ports);
  assert.equal(sends, 1);
  assert.equal(reserves, 1);
  ports.chainId = async () => 143;
  await assert.rejects(fundTestnetGas(wallet, id, 1, ports), /Wrong sponsorship chain/);
  assert.equal(sends, 1);
});
it("unconfirmed gas funding cannot advance to an APP transaction or be broadcast a second time", async () => {
  const { fundTestnetGas } = await import("./auth/testnet-gas.server.ts");
  let row: (import("./auth/operation-runner.ts").OperationResult & { bodyHash: string }) | null =
      null,
    sends = 0;
  const ports: import("./auth/testnet-gas.server.ts").GasPorts = {
    chainId: async () => 10143,
    baseFee: async () => 1n,
    balance: async () => 0n,
    sponsor: recipient,
    store: (_id, bodyHash) => ({
      lookup: async () => row,
      lock: async () => true,
      begin: async () => {
        row = { bodyHash, status: "pending", hashes: [] };
      },
      hashes: async (h) => {
        row!.hashes = h;
      },
      status: async (s) => {
        row!.status = s;
      },
      release: async () => {},
    }),
    reserve: async () => {},
    sign: async () => hash,
    send: async () => {
      sends++;
    },
    confirmed: async () => {
      throw new Error("lost receipt");
    },
  };
  await assert.rejects(fundTestnetGas(wallet, id, 0, ports), /pending/);
  await assert.rejects(fundTestnetGas(wallet, id, 0, ports), /pending/);
  assert.equal(sends, 1);
});
it("browser-supplied paid flags, sender, amount, chain and transaction hash are rejected", async () => {
  const { textInputSchema } = await import("./testnet-chat.server.ts");
  const input = { requestId: id, tokenId: 1, content: "hello", history: [] };
  assert.deepEqual(textInputSchema.parse(input), input);
  for (const forged of [
    { paid: true },
    { sender: recipient },
    { amount: "0" },
    { chainId: 143 },
    { paymentHash: hash },
  ])
    assert.throws(() => textInputSchema.parse({ ...input, ...forged }));
});
it("a failed durable receipt write prevents model execution", async () => {
  const f = setup();
  f.store.save = async () => {
    throw new Error("database unavailable");
  };
  await assert.rejects(runTestnetText(id, body, f.store, f.deps), /database unavailable/);
  assert.equal(f.counts().models, 0);
});

it("NFT gas funding supports a bounded product budget and refuses an invalid budget", () => {
  assert.equal(gasBudget(1n, 2_000_000n).gas, 2_000_000n);
  for (const gas of [0n, 20_999n, 2_000_001n]) assert.throws(() => gasBudget(1n, gas), /gas limit/);
  assert.throws(() => gasBudget(200_000_000_000n, 2_000_000n), /sponsorship limit/);
});
