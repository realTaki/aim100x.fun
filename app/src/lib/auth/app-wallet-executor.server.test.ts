import { it } from "node:test";
import assert from "node:assert/strict";
import { keccak256, parseTransaction, recoverTransactionAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ensureAppWalletDelegation } from "./app-wallet-executor.server.ts";
import {
  APP_ACCOUNT_IMPLEMENTATION,
  APP_ENTRY_POINT,
  testnetWalletChain,
} from "./app-wallet-chain.ts";
import { appWalletDelegationCode } from "./app-wallet-7702.ts";
import { MONAD_PRIORITY_FEE } from "./testnet-gas.server.ts";

const ownerKey = ("0x" + "11".repeat(32)) as Hex;
const sponsorKey = ("0x" + "22".repeat(32)) as Hex;
const owner = privateKeyToAccount(ownerKey);
const sponsor = privateKeyToAccount(sponsorKey);

it("sponsor submits a type-4 7702 delegation on testnet and never sends MON to the APP wallet", async (t) => {
  const rpcBefore = process.env.ALCHEMY_MONAD_TESTNET_RPC_URL,
    keyBefore = process.env.PAYMASTER_SIGNER;
  process.env.ALCHEMY_MONAD_TESTNET_RPC_URL =
    "https://monad-testnet.g.alchemy.com/v2/offline-fixture";
  process.env.PAYMASTER_SIGNER = sponsorKey;
  t.after(() => {
    if (rpcBefore === undefined) delete process.env.ALCHEMY_MONAD_TESTNET_RPC_URL;
    else process.env.ALCHEMY_MONAD_TESTNET_RPC_URL = rpcBefore;
    if (keyBefore === undefined) delete process.env.PAYMASTER_SIGNER;
    else process.env.PAYMASTER_SIGNER = keyBefore;
  });
  let ownerCode: Hex | undefined;
  const sent: Hex[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const rpc = JSON.parse(String(init.body)) as { method: string; id?: number; params?: Hex[] };
    let result: unknown;
    if (rpc.method === "eth_chainId") result = "0x279f";
    else if (rpc.method === "eth_getCode") {
      const address = String(rpc.params?.[0]).toLowerCase();
      if (address === APP_ACCOUNT_IMPLEMENTATION.toLowerCase()) result = "0x606060";
      else if (address === APP_ENTRY_POINT.toLowerCase()) result = "0x608060";
      else if (address === owner.address.toLowerCase()) result = ownerCode ?? "0x";
      else result = "0x";
    } else if (rpc.method === "eth_call") {
      result = `0x${"00".repeat(12)}${APP_ENTRY_POINT.slice(2)}`;
    } else if (rpc.method === "eth_getTransactionCount") result = "0x0";
    else if (rpc.method === "eth_getBlockByNumber")
      result = { baseFeePerGas: "0x174876e800", number: "0x1" };
    else if (rpc.method === "eth_sendRawTransaction") {
      const bytes = rpc.params![0];
      const tx = parseTransaction(bytes);
      assert.equal(
        (
          await recoverTransactionAddress({
            serializedTransaction: bytes as `0x04${string}`,
          })
        ).toLowerCase(),
        sponsor.address.toLowerCase(),
      );
      assert.equal(Number(tx.chainId), 10143);
      assert.equal(tx.to?.toLowerCase(), owner.address.toLowerCase());
      assert.equal(tx.value ?? 0n, 0n);
      assert.equal(tx.type, "eip7702");
      assert.equal(tx.authorizationList?.length, 1);
      assert.equal(
        tx.authorizationList![0].address.toLowerCase(),
        APP_ACCOUNT_IMPLEMENTATION.toLowerCase(),
      );
      assert.equal(Number(tx.authorizationList![0].chainId), 10143);
      assert.ok((tx.maxPriorityFeePerGas ?? 0n) >= MONAD_PRIORITY_FEE);
      sent.push(bytes);
      ownerCode = appWalletDelegationCode();
      result = keccak256(bytes);
    } else if (rpc.method === "eth_getTransactionReceipt") {
      result = {
        transactionHash: rpc.params![0],
        transactionIndex: "0x0",
        blockHash: "0x" + "22".repeat(32),
        blockNumber: "0x1",
        from: sponsor.address,
        to: owner.address,
        contractAddress: null,
        cumulativeGasUsed: "0x5208",
        gasUsed: "0x5208",
        effectiveGasPrice: "0x1",
        logs: [],
        logsBloom: "0x" + "00".repeat(256),
        status: "0x1",
        type: "0x4",
      };
    } else assert.fail(`Unexpected RPC ${rpc.method}`);
    return Response.json({ jsonrpc: "2.0", id: rpc.id ?? 1, result });
  });
  await ensureAppWalletDelegation(owner, testnetWalletChain);
  assert.equal(sent.length, 1);
  await ensureAppWalletDelegation(owner, testnetWalletChain);
  assert.equal(sent.length, 1);
});
