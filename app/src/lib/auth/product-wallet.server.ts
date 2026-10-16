import { initializeProductSchema, operationStore } from "./operation-store.server.ts";
import {
  productGasLimit,
  gasBudget,
  sponsoredOuterGas,
  reserveSponsoredGas,
  MAX_PRODUCT_GAS,
  MAX_SPONSORED_FEE,
  SPONSORED_GAS,
  SPONSORED_VERIFICATION_GAS,
  SPONSORED_PRE_VERIFICATION_GAS,
  sponsorAccount,
} from "./testnet-gas.server.ts";
import { runProductOperation } from "./operation-runner.ts";
import { monadTransport } from "../monad-rpc.ts";
import { createHash } from "node:crypto";
import { createPublicClient, createWalletClient, erc20Abi, keccak256, type Hex } from "viem";
import { z } from "zod";
import { boundAppWallet } from "./app-wallet.server.ts";
import { APP_ENTRY_POINT, testnetWalletChain } from "./app-wallet-chain.ts";
import {
  ENTRY_POINT_ABI,
  encodeAccountExecute,
  encodeAccountExecuteBatch,
  encodeHandleOps,
  packUint128Pair,
  userOperationTypedData,
  type PackedUserOperation,
} from "./app-wallet-7702.ts";
import { ensureAppWalletDelegation } from "./app-wallet-executor.server.ts";
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
export { initializeProductSchema };
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
  return executeTestnetCalls(user, requestId, hashBody, plan, {}, { batch: action.kind === "image" });
}

export async function executeTestnetCalls(
  user: SessionUser,
  requestId: string,
  bodyHash: string,
  plan: () => Promise<ProductCall[]>,
  ports: {
    store?: import("./operation-runner.ts").OperationStore;
    active?: typeof authStore.active;
    delegate?: typeof ensureAppWalletDelegation;
    reserve?: typeof reserveSponsoredGas;
  } = {},
  opts: { batch?: boolean } = {},
) {
  const account = boundAppWallet(user).account;
  const sponsor = sponsorAccount();
  if (sponsor.address.toLowerCase() === account.address.toLowerCase())
    throw new Error("Sponsor cannot be user");
  const reader = createPublicClient({
    chain: testnetWalletChain,
    transport: monadTransport(10143),
  });
  if ((await reader.getChainId()) !== 10143) throw new Error("Wrong product chain");
  const writer = createWalletClient({
    account: sponsor,
    chain: testnetWalletChain,
    transport: monadTransport(10143),
  });
  const signedRequests = new Map<Hex, Hex>();
  let index = 0;
  const planned = async () => {
    const calls = await plan();
    if (!opts.batch || calls.length < 2) return calls;
    // Photo unlock is approve + tagged pay. One UserOp so preflight has allowance.
    return [{ to: account.address, value: 0n, data: encodeAccountExecuteBatch(calls) }];
  };
  return runProductOperation(
    bodyHash,
    planned,
    ports.store ??
      operationStore(user.id, requestId, bodyHash, (hash) =>
        reader
          .getTransactionReceipt({ hash })
          .then((r) => r.status)
          .catch(() => "unavailable" as const),
      ),
    {
      async sign(call) {
        if (!(await (ports.active ?? authStore.active)(user.sessionId, user.id)))
          throw new Error("Session revoked");
        const batched = opts.batch && call.to.toLowerCase() === account.address.toLowerCase();
        const inner = batched
          ? { account: account.address, to: account.address, data: call.data, value: 0n }
          : { account: account.address, ...call };
        if (batched) await (ports.delegate ?? ensureAppWalletDelegation)(account, testnetWalletChain);
        await reader.call({ ...inner, gas: MAX_PRODUCT_GAS });
        if (!batched) await (ports.delegate ?? ensureAppWalletDelegation)(account, testnetWalletChain);
        let innerGas: bigint;
        try {
          innerGas = productGasLimit(await reader.estimateGas(inner));
        } catch {
          innerGas = SPONSORED_GAS;
        }
        const outerGas = sponsoredOuterGas(innerGas);
        const baseFee = (await reader.getBlock()).baseFeePerGas ?? 0n;
        const budget = gasBudget(baseFee, outerGas);
        const sponsorshipIndex = index++;
        await (ports.reserve ?? reserveSponsoredGas)(
          account.address,
          requestId,
          sponsorshipIndex,
          budget.gas * budget.maxFeePerGas,
        );
        const nonce = await reader.readContract({
          address: APP_ENTRY_POINT,
          abi: ENTRY_POINT_ABI,
          functionName: "getNonce",
          args: [account.address, 0n],
        });
        const unsigned = {
          sender: account.address,
          nonce,
          initCode: "0x" as Hex,
          callData: batched ? call.data : encodeAccountExecute(call),
          accountGasLimits: packUint128Pair(SPONSORED_VERIFICATION_GAS, innerGas),
          preVerificationGas: SPONSORED_PRE_VERIFICATION_GAS,
          // Zero UserOp fees: the APP wallet never pays native gas. The sponsor's
          // outer handleOps transaction pays Monad fees under the daily allowance.
          gasFees: packUint128Pair(0n, 0n),
          paymasterAndData: "0x" as Hex,
        };
        const userOp: PackedUserOperation = {
          ...unsigned,
          signature: await account.signTypedData(userOperationTypedData(unsigned)),
        };
        const request = await writer.prepareTransactionRequest({
          account: sponsor,
          chain: testnetWalletChain,
          type: "eip1559",
          to: APP_ENTRY_POINT,
          data: encodeHandleOps([userOp], sponsor.address),
          value: 0n,
          gas: budget.gas,
          maxFeePerGas: budget.maxFeePerGas,
          maxPriorityFeePerGas: budget.maxPriorityFeePerGas,
        });
        if (
          request.chainId !== 10143 ||
          request.to?.toLowerCase() !== APP_ENTRY_POINT.toLowerCase() ||
          (request.value ?? 0n) !== 0n ||
          request.gas > budget.gas ||
          request.maxFeePerGas > MAX_SPONSORED_FEE ||
          !request.maxPriorityFeePerGas
        )
          throw new Error("Transaction exceeds gas policy");
        const signed = await sponsor.signTransaction(request),
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
