import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rejectMainnetSpending } from "./mainnet-disabled.server.ts";
import {
  DAILY_GAS_ALLOWANCE,
  MAX_PRODUCT_GAS,
  MAX_SPONSORED_FEE,
  MAX_SPONSORED_OUTER_GAS,
  MONAD_PRIORITY_FEE,
  SPONSORED_GAS,
  gasBudget,
  productGasLimit,
  sponsoredOuterGas,
} from "./testnet-gas.server.ts";

const MONAD_TESTNET_BASE_FEE = 100_000_000_000n;

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
  for (const gas of [0n, 20_999n, MAX_SPONSORED_OUTER_GAS + 1n])
    assert.throws(() => gasBudget(1n, gas), /gas limit/);
  assert.equal(productGasLimit(200_000n), 215_000n);
  assert.equal(productGasLimit(MAX_PRODUCT_GAS), MAX_PRODUCT_GAS);
  assert.equal(productGasLimit(20_000n), 22_575n);
  const outer = sponsoredOuterGas(200_000n);
  assert.ok(outer > productGasLimit(200_000n));
  assert.ok(outer <= MAX_SPONSORED_OUTER_GAS);
  assert.ok(gasBudget(MONAD_TESTNET_BASE_FEE, outer).gas * MAX_SPONSORED_FEE < DAILY_GAS_ALLOWANCE);
});

it("refuses mainnet spending independently of testnet 7702 sponsorship", () => {
  assert.throws(rejectMainnetSpending, /Mainnet spending and delegation are disabled/);
});

it("faucet, subscribe and chat sends use 7702 sponsor-submitted handleOps on chain 10143", () => {
  const walletSrc = readFileSync(new URL("./product-wallet.server.ts", import.meta.url), "utf8");
  const chatSrc = readFileSync(new URL("../testnet-chat.server.ts", import.meta.url), "utf8");
  const imageSrc = readFileSync(new URL("../chat-image-payment.server.ts", import.meta.url), "utf8");
  const httpSrc = readFileSync(new URL("./wallet-auth-http.server.ts", import.meta.url), "utf8");
  const gasSrc = readFileSync(new URL("./testnet-gas.server.ts", import.meta.url), "utf8");
  const executorSrc = readFileSync(new URL("./app-wallet-executor.server.ts", import.meta.url), "utf8");
  assert.match(httpSrc, /executeProductRequest/);
  assert.match(walletSrc, /ensureAppWalletDelegation/);
  assert.match(walletSrc, /encodeHandleOps/);
  assert.match(walletSrc, /APP_ENTRY_POINT/);
  assert.match(walletSrc, /packUint128Pair\(0n, 0n\)/);
  assert.match(walletSrc, /reserveSponsoredGas/);
  assert.match(walletSrc, /batch: action.kind === "image"/);
  assert.match(walletSrc, /encodeAccountExecuteBatch/);
  assert.doesNotMatch(walletSrc, /sponsorTestnetGas|fundTestnetGas/);
  assert.doesNotMatch(gasSrc, /function fundTestnetGas|function sponsorTestnetGas/);
  assert.match(executorSrc, /testnet-only/);
  assert.match(executorSrc, /mainnetWalletChain\.id\) rejectMainnetSpending/);
  assert.match(walletSrc, /MAX_SPONSORED_FEE/);
  assert.match(chatSrc, /executeTestnetCalls\(/);
  assert.doesNotMatch(chatSrc, /sponsor:/);
  assert.match(walletSrc, /getChainId\(\)\) !== 10143/);
  assert.match(chatSrc, /getChainId\(\)\) !== 10143/);
  assert.match(gasSrc, /MONAD_PRIORITY_FEE/);
  assert.match(imageSrc, /sponsoredCallsFromHandleOps/);
  assert.match(imageSrc, /APP_ENTRY_POINT/);
  assert.doesNotMatch(imageSrc, /tx\.from\.toLowerCase\(\) !== wallet/);
});
