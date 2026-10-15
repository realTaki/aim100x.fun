import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Address, Hex } from "viem";
import { rejectMainnetSpending } from "./mainnet-disabled.server.ts";
import {
  DAILY_GAS_ALLOWANCE,
  MAX_PRODUCT_GAS,
  MAX_SPONSORED_FEE,
  MONAD_PRIORITY_FEE,
  SPONSORED_GAS,
  fundTestnetGas,
  gasBudget,
  productGasLimit,
  type GasPorts,
} from "./testnet-gas.server.ts";
import type { OperationResult } from "./operation-runner.ts";

const wallet = "0x1111111111111111111111111111111111111111" as Address;
const sponsor = "0x2222222222222222222222222222222222222222" as Address;
const hash = ("0x" + "33".repeat(32)) as Hex;
const requestId = "11111111-1111-4111-a111-111111111111";
const MONAD_TESTNET_BASE_FEE = 100_000_000_000n;

function fundingPorts(overrides: Partial<GasPorts> = {}) {
  let row: (OperationResult & { bodyHash: string }) | null = null;
  let balance = 0n,
    locked = false,
    sends = 0,
    reserves = 0,
    value = 0n;
  const ports: GasPorts = {
    chainId: async () => 10143,
    baseFee: async () => MONAD_TESTNET_BASE_FEE,
    balance: async () => balance,
    sponsor,
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
    ...overrides,
  };
  return {
    ports,
    stats: () => ({ balance, sends, reserves, value }),
  };
}

it("clamps the 2x fee buffer so a 100 gwei Monad testnet base fee still sponsors under 200 gwei", () => {
  const budget = gasBudget(MONAD_TESTNET_BASE_FEE, MAX_PRODUCT_GAS);
  assert.equal(budget.gas, MAX_PRODUCT_GAS);
  assert.equal(budget.maxFeePerGas, MAX_SPONSORED_FEE);
  assert.equal(budget.maxPriorityFeePerGas, MONAD_PRIORITY_FEE);
  assert.ok(budget.gas * budget.maxFeePerGas < DAILY_GAS_ALLOWANCE);
  assert.equal(gasBudget(1n).gas, SPONSORED_GAS);
  assert.equal(gasBudget(MAX_SPONSORED_FEE).maxFeePerGas, MAX_SPONSORED_FEE);
  assert.equal(gasBudget(MAX_SPONSORED_FEE).maxPriorityFeePerGas, MONAD_PRIORITY_FEE);
  assert.throws(() => gasBudget(MAX_SPONSORED_FEE + 1n), /sponsorship limit/);
  for (const gas of [0n, 20_999n, MAX_PRODUCT_GAS + 1n])
    assert.throws(() => gasBudget(1n, gas), /gas limit/);
  assert.equal(productGasLimit(200_000n), 215_000n);
  assert.equal(productGasLimit(MAX_PRODUCT_GAS), MAX_PRODUCT_GAS);
  assert.equal(productGasLimit(20_000n), 22_575n);
});

it("funds an empty APP wallet at the live Monad testnet base fee before any APP signature", async () => {
  const { ports, stats } = fundingPorts();
  const funded = await fundTestnetGas(wallet, requestId, 0, ports, MAX_PRODUCT_GAS);
  assert.equal(funded.maxFeePerGas, MAX_SPONSORED_FEE);
  assert.equal(stats().balance, funded.gas * funded.maxFeePerGas);
  assert.equal(stats().sends, 1);
  assert.equal(stats().reserves, 1);
  await fundTestnetGas(wallet, requestId, 0, ports, MAX_PRODUCT_GAS);
  assert.equal(stats().sends, 1);
});

it("refuses mainnet sponsorship, self-funding, and mainnet spending", async () => {
  const { ports, stats } = fundingPorts({ chainId: async () => 143 });
  await assert.rejects(
    fundTestnetGas(wallet, requestId, 0, ports, MAX_PRODUCT_GAS),
    /Wrong sponsorship chain/,
  );
  assert.equal(stats().sends, 0);
  const same = fundingPorts({ sponsor: wallet });
  await assert.rejects(
    fundTestnetGas(wallet, requestId, 1, same.ports, MAX_PRODUCT_GAS),
    /Invalid gas recipient/,
  );
  assert.equal(same.stats().sends, 0);
  assert.throws(rejectMainnetSpending, /Mainnet spending and delegation are disabled/);
});

it("faucet, subscribe and chat sends default to sponsorTestnetGas on chain 10143", () => {
  const walletSrc = readFileSync(new URL("./product-wallet.server.ts", import.meta.url), "utf8");
  const chatSrc = readFileSync(new URL("../testnet-chat.server.ts", import.meta.url), "utf8");
  const httpSrc = readFileSync(new URL("./wallet-auth-http.server.ts", import.meta.url), "utf8");
  const gasSrc = readFileSync(new URL("./testnet-gas.server.ts", import.meta.url), "utf8");
  assert.match(httpSrc, /executeProductRequest/);
  assert.match(walletSrc, /await sponsorTestnetGas\(/);
  assert.match(walletSrc, /MAX_SPONSORED_FEE/);
  assert.match(walletSrc, /waitForReserveDelay/);
  assert.match(walletSrc, /productGasLimit/);
  assert.match(chatSrc, /executeTestnetCalls\(/);
  assert.doesNotMatch(chatSrc, /sponsor:/);
  assert.match(gasSrc, /chainId\(\)\) !== 10143/);
  assert.match(walletSrc, /getChainId\(\)\) !== 10143/);
  assert.match(chatSrc, /getChainId\(\)\) !== 10143/);
  assert.doesNotMatch(gasSrc, /chainId\(\)\) !== 143/);
  assert.match(gasSrc, /MONAD_PRIORITY_FEE/);
});
