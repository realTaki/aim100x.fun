import { operationStore } from "./operation-store.server.ts";
import { sponsorTestnetGas, MAX_PRODUCT_GAS } from "./testnet-gas.server.ts";
import { runProductOperation } from "./operation-runner.ts";
import { monadTransport } from "../monad-rpc.ts";
import { createHash } from "node:crypto";
import { createPublicClient, createWalletClient, erc20Abi, http, keccak256, type Hex } from "viem";
import { z } from "zod";
import { mediaSql } from "../media-storage.server.ts";
import { boundAppWallet } from "./app-wallet.server.ts";
import { testnetWalletChain } from "./app-wallet-chain.ts";
import {
  IDOLS100X_ADDRESS,
  IDOLS100X_IDOL_ABI,
  IDOLS100X_ABI,
  LONELY_USD_ADDRESS,
} from "../idols100x.ts";
import { prepareImagePayment } from "../chat-image-payment.server.ts";
import { actionSchema, planProductAction, type ProductCall } from "./product-policy.server.ts";
import type { SessionUser } from "./wallet-auth.server.ts";
import { authStore } from "./account-store.server.ts";
export async function initializeProductSchema() {
  const sql = mediaSql();
  await sql`CREATE TABLE IF NOT EXISTS aim_wallet_requests (account_id text NOT NULL, request_id uuid NOT NULL, body_hash text NOT NULL, status text NOT NULL, hashes jsonb NOT NULL DEFAULT '[]', expected integer NOT NULL, PRIMARY KEY(account_id,request_id))`;
  await sql`CREATE TABLE IF NOT EXISTS aim_wallet_locks (account_id text PRIMARY KEY, request_id uuid NOT NULL)`;
}
const inputSchema = z.object({ requestId: z.string().uuid(), action: actionSchema }).strict();
/** Only server-constructed allowlisted testnet operations. No arbitrary calldata or delegation. */
export async function executeProductRequest(user: SessionUser, raw: unknown) {
  const { requestId, action } = inputSchema.parse(raw);
  if (
    ["agent", "removeAgent", "withdraw", "sale", "pricing"].includes(action.kind) &&
    Date.now() / 1000 - user.authenticatedAt > 300
  )
    throw new Error("Sign in again before a sensitive operation");
  const hashBody = createHash("sha256").update(JSON.stringify(action)).digest("hex");
  const account = boundAppWallet(user).account;
  const reader = createPublicClient({
    chain: testnetWalletChain,
    transport: monadTransport(10143),
  });
  if ((await reader.getChainId()) !== 10143) throw new Error("Wrong product chain");
  const plan = () =>
    planProductAction(action, account.address, {
      owner: (token) =>
        reader.readContract({
          address: IDOLS100X_ADDRESS,
          abi: IDOLS100X_IDOL_ABI,
          functionName: "ownerOf",
          args: [BigInt(token)],
        }),
      price: async (token, kind) =>
        kind === "buy"
          ? reader.readContract({
              address: IDOLS100X_ADDRESS,
              abi: IDOLS100X_IDOL_ABI,
              functionName: "salePriceUsdcOf",
              args: [BigInt(token)],
            })
          : (
              await reader.readContract({
                address: IDOLS100X_ADDRESS,
                abi: IDOLS100X_IDOL_ABI,
                functionName: "idolOf",
                args: [BigInt(token)],
              })
            ).subscribePriceUsdc,
      tba: (token) =>
        reader.readContract({
          address: IDOLS100X_ADDRESS,
          abi: IDOLS100X_ABI,
          functionName: "tokenBoundAccount",
          args: [BigInt(token)],
        }),
      balance: (address) =>
        reader.readContract({
          address: LONELY_USD_ADDRESS,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        }),
      image: (imageId, ticket) =>
        prepareImagePayment(account.address.toLowerCase(), account.address, imageId, ticket),
    });
  return executeTestnetCalls(user, requestId, hashBody, plan);
}

export async function executeTestnetCalls(
  user: SessionUser,
  requestId: string,
  bodyHash: string,
  plan: () => Promise<ProductCall[]>,
  ports: {
    store?: import("./operation-runner.ts").OperationStore;
    active?: typeof authStore.active;
    sponsor?: typeof sponsorTestnetGas;
  } = {},
) {
  const account = boundAppWallet(user).account;
  const reader = createPublicClient({
    chain: testnetWalletChain,
    transport: monadTransport(10143),
  });
  if ((await reader.getChainId()) !== 10143) throw new Error("Wrong product chain");
  const writer = createWalletClient({
    account,
    chain: testnetWalletChain,
    transport: monadTransport(10143),
  });
  const signedRequests = new Map<Hex, Hex>();
  let index = 0;
  return runProductOperation(
    bodyHash,
    plan,
    ports.store ??
      operationStore(user.id, requestId, bodyHash, (hash) =>
        reader
          .getTransactionReceipt({ hash })
          .then((r) => r.status)
          .catch(() => null),
      ),
    {
      async sign(call) {
        if (!(await (ports.active ?? authStore.active)(user.sessionId, user.id)))
          throw new Error("Session revoked");
        // Bounded gas for the allowlisted faucet, ERC20 transfer/approval and subscription.
        // Sponsor funds gas before APP signing; users need no testnet MON for these flows.
        await reader.call({ account: account.address, ...call, gas: MAX_PRODUCT_GAS });
        const gas = await (ports.sponsor ?? sponsorTestnetGas)(
          account.address,
          requestId,
          index++,
          MAX_PRODUCT_GAS,
        );
        const request = await writer.prepareTransactionRequest({
          ...call,
          ...gas,
          type: "eip1559",
          account,
          chain: testnetWalletChain,
        });
        if (
          request.chainId !== 10143 ||
          request.gas > 2_000_000n ||
          request.maxFeePerGas > 200_000_000_000n
        )
          throw new Error("Transaction exceeds gas policy");
        const signed = await account.signTransaction(request),
          hash = keccak256(signed);
        signedRequests.set(hash, signed);
        return hash;
      },
      async send(hash) {
        const sent = await writer.sendRawTransaction({
          serializedTransaction: signedRequests.get(hash)!,
        });
        signedRequests.delete(hash);
        if (sent !== hash) throw new Error("Unexpected transaction hash");
      },
      async confirmed(hash) {
        return (
          (await reader.waitForTransactionReceipt({ hash, timeout: 25_000 })).status === "success"
        );
      },
    },
  );
}
