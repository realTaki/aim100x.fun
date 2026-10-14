import { runProductOperation, type OperationResult } from "./operation-runner.ts";
import { monadTransport } from "../monad-rpc.ts";
import { createHash } from "node:crypto";
import { createPublicClient, createWalletClient, erc20Abi, http, keccak256, type Hex } from "viem";
import { z } from "zod";
import { mediaSql } from "../media-storage.server.ts";
import { boundAppWallet } from "./app-wallet.server.ts";
import { testnetWalletChain } from "./app-wallet-chain.ts";
import { IDOLS100X_ADDRESS, IDOLS100X_IDOL_ABI, IDOLS100X_ABI, LONELY_USD_ADDRESS } from "../idols100x.ts";
import { prepareImagePayment } from "../chat-image-payment.server.ts";
import { actionSchema, planProductAction } from "./product-policy.server.ts";
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
  if (["agent", "removeAgent", "withdraw", "sale", "pricing"].includes(action.kind) && Date.now() / 1000 - user.authenticatedAt > 300)
    throw new Error("Sign in again before a sensitive operation");
  const hashBody = createHash("sha256").update(JSON.stringify(action)).digest("hex");
  const sql = mediaSql();
  const account = boundAppWallet(user).account;
  const reader = createPublicClient({ chain: testnetWalletChain, transport: monadTransport(10143) });
  if (await reader.getChainId() !== 10143) throw new Error("Wrong product chain");
  const plan = () => planProductAction(action, account.address, {
    owner: token => reader.readContract({ address: IDOLS100X_ADDRESS, abi: IDOLS100X_IDOL_ABI, functionName: "ownerOf", args: [BigInt(token)] }),
    price: async (token, kind) => kind === "buy"
      ? reader.readContract({ address: IDOLS100X_ADDRESS, abi: IDOLS100X_IDOL_ABI, functionName: "salePriceUsdcOf", args: [BigInt(token)] })
      : (await reader.readContract({ address: IDOLS100X_ADDRESS, abi: IDOLS100X_IDOL_ABI, functionName: "idolOf", args: [BigInt(token)] })).subscribePriceUsdc,
    tba: token => reader.readContract({ address: IDOLS100X_ADDRESS, abi: IDOLS100X_ABI, functionName: "tokenBoundAccount", args: [BigInt(token)] }),
    balance: address => reader.readContract({ address: LONELY_USD_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
    image: (imageId, ticket) => prepareImagePayment(account.address.toLowerCase(), account.address, imageId, ticket),
  });
  const writer = createWalletClient({ account, chain: testnetWalletChain, transport: monadTransport(10143) });
  const signedRequests = new Map<Hex, Hex>();
  return runProductOperation(hashBody, plan, {
    async lookup() {
      const [row] = await sql`SELECT * FROM aim_wallet_requests WHERE account_id=${user.id} AND request_id=${requestId}`;
      if (!row) return null;
      const hashes = row.hashes as Hex[];
      // Read-only recovery after a lost response: complete only when every planned
      // transaction has a durable hash and a mined receipt. Never submit again.
      if (row.status === "pending" && hashes.length === row.expected) {
        const receipts = await Promise.all(hashes.map(hash => reader.getTransactionReceipt({ hash }).catch(() => null)));
        if (receipts.every(Boolean)) {
          row.status = receipts.every(r => r?.status === "success") ? "confirmed" : "failed";
          await sql`UPDATE aim_wallet_requests SET status=${row.status as string} WHERE account_id=${user.id} AND request_id=${requestId}`;
          await sql`DELETE FROM aim_wallet_locks WHERE account_id=${user.id} AND request_id=${requestId}`;
        }
      }
      return { bodyHash: row.body_hash as string, status: row.status as OperationResult["status"], hashes };
    },
    async lock() {
      const rows = await sql`INSERT INTO aim_wallet_locks (account_id,request_id) VALUES (${user.id},${requestId}) ON CONFLICT DO NOTHING RETURNING account_id`;
      return rows.length === 1;
    },
    async begin(count) { await sql`INSERT INTO aim_wallet_requests (account_id,request_id,body_hash,status,expected) VALUES (${user.id},${requestId},${hashBody},'pending',${count})`; },
    async hashes(hashes) { await sql`UPDATE aim_wallet_requests SET hashes=${JSON.stringify(hashes)}::jsonb WHERE account_id=${user.id} AND request_id=${requestId}`; },
    async status(status) { await sql`UPDATE aim_wallet_requests SET status=${status} WHERE account_id=${user.id} AND request_id=${requestId}`; },
    async release() { await sql`DELETE FROM aim_wallet_locks WHERE account_id=${user.id} AND request_id=${requestId}`; },
  }, {
    async sign(call) {
      if (!await authStore.active(user.sessionId, user.id)) throw new Error("Session revoked");
      const request = await writer.prepareTransactionRequest({ ...call, type: "eip1559", account, chain: testnetWalletChain });
      if (request.chainId !== 10143 || request.gas > 2_000_000n || request.maxFeePerGas > 200_000_000_000n) throw new Error("Transaction exceeds gas policy");
      const signed = await account.signTransaction(request), hash = keccak256(signed);
      signedRequests.set(hash, signed);
      return hash;
    },
    async send(hash) {
      const sent = await writer.sendRawTransaction({ serializedTransaction: signedRequests.get(hash)! });
      signedRequests.delete(hash);
      if (sent !== hash) throw new Error("Unexpected transaction hash");
    },
    async confirmed(hash) { return (await reader.waitForTransactionReceipt({ hash, timeout: 25_000 })).status === "success"; },
  });
}
