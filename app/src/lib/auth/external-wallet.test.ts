import { it } from "node:test";
import assert from "node:assert/strict";
import { encodeFunctionData, erc20Abi, type EIP1193Provider, type Hex } from "viem";
import { executeExternalCalls } from "./external-wallet.ts";
import { IDOLS100X_ADDRESS, IDOLS100X_IDOL_ABI, LONELY_USD_ADDRESS } from "../idols100x.ts";
const external = "0x1111111111111111111111111111111111111111";
const hash = ("0x" + "22".repeat(32)) as Hex;
function walletMock({
  account = external,
  reject = false,
  switchAccountAfterReceipt = false,
} = {}) {
  let chainId = 143;
  let address = account;
  let signatureRequests = 0;
  const sent: { from: string; to: string; data: Hex }[] = [];
  const provider = {
    request: async ({ method, params }: { method: string; params?: unknown }) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [address];
      if (method === "eth_chainId") return `0x${chainId.toString(16)}`;
      if (method === "wallet_switchEthereumChain") {
        chainId = 10143;
        return null;
      }
      if (method === "eth_sendTransaction") {
        signatureRequests++;
        if (reject) throw Object.assign(new Error("User rejected transaction"), { code: 4001 });
        sent.push((params as { from: string; to: string; data: Hex }[])[0]);
        return hash;
      }
      throw new Error(`Unexpected RPC: ${method}`);
    },
  } as EIP1193Provider;
  return {
    provider,
    sent,
    get signatureRequests() {
      return signatureRequests;
    },
    receipt: async () => {
      if (switchAccountAfterReceipt) address = "0x3333333333333333333333333333333333333333";
      return { status: "success" as const };
    },
  };
}
const calls = [
  {
    to: LONELY_USD_ADDRESS,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [IDOLS100X_ADDRESS, 1_000_000n],
    }),
  },
  {
    to: IDOLS100X_ADDRESS,
    data: encodeFunctionData({ abi: IDOLS100X_IDOL_ABI, functionName: "mint" }),
  },
];
it("sends approval and NFT mint from the external wallet on testnet, after each receipt", async () => {
  const mock = walletMock();
  let receipts = 0;
  await executeExternalCalls(external, calls, {
    provider: mock.provider,
    waitForReceipt: async () => {
      assert.equal(mock.sent.length, ++receipts);
      return mock.receipt();
    },
  });
  assert.equal(mock.sent.length, 2);
  assert.equal(mock.sent[0].from.toLowerCase(), external);
  assert.equal(mock.sent[1].from.toLowerCase(), external); // mint() uses msg.sender as NFT owner.
  assert.equal(mock.sent[1].to.toLowerCase(), IDOLS100X_ADDRESS.toLowerCase());
});
it("rejects a wallet account different from the verified login before sending", async () => {
  const mock = walletMock({ account: "0x3333333333333333333333333333333333333333" });
  await assert.rejects(
    executeExternalCalls(external, calls, {
      provider: mock.provider,
      waitForReceipt: mock.receipt,
    }),
    /Sign in again/,
  );
  assert.equal(mock.sent.length, 0);
});
it("stops after a rejected wallet signature without retrying", async () => {
  const mock = walletMock({ reject: true });
  await assert.rejects(
    executeExternalCalls(external, calls, {
      provider: mock.provider,
      waitForReceipt: mock.receipt,
    }),
  );
  assert.equal(mock.sent.length, 0);
  assert.equal(mock.signatureRequests, 1);
});
it("stops after an ambiguous approval receipt or an account switch", async () => {
  const mock = walletMock();
  await assert.rejects(
    executeExternalCalls(external, calls, {
      provider: mock.provider,
      waitForReceipt: async () => {
        throw new Error("timeout");
      },
    }),
    /duplicate payment/,
  );
  assert.equal(mock.sent.length, 1);
  const switched = walletMock({ switchAccountAfterReceipt: true });
  await assert.rejects(
    executeExternalCalls(external, calls, {
      provider: switched.provider,
      waitForReceipt: switched.receipt,
    }),
    /account changed/,
  );
  assert.equal(switched.sent.length, 1);
});

it("rejects mainnet before requesting an external wallet and never adds the read-only proxy as wallet RPC", async () => {
  const { externalSigningClient } = await import("./external-wallet.ts");
  const { mainnetWalletChain, testnetWalletChain } = await import("./app-wallet-chain.ts");
  const noCalls: EIP1193Provider = {
    on() {},
    removeListener() {},
    request: async () => {
      assert.fail("Must not contact mainnet wallet");
    },
  };
  await assert.rejects(
    externalSigningClient(external, mainnetWalletChain, noCalls),
    /mainnet RPC is disabled/,
  );
  const methods: string[] = [];
  const provider = {
    request: async ({ method }: { method: string }) => {
      methods.push(method);
      if (method === "eth_requestAccounts") return [external];
      if (method === "eth_chainId") return "0x1";
      if (method === "wallet_switchEthereumChain")
        throw Object.assign(new Error("Unknown chain"), { code: 4902 });
      assert.fail(`Unexpected wallet method: ${method}`);
    },
  } as EIP1193Provider;
  await assert.rejects(
    externalSigningClient(external, testnetWalletChain, provider),
    /Add Monad Testnet \(10143\)/,
  );
  assert.ok(!methods.includes("wallet_addEthereumChain"));
});
