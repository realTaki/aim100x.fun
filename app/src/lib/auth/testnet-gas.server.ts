import { mediaSql } from "../media-storage.server.ts";
import { createHash } from "node:crypto";
import { createPublicClient, createWalletClient, keccak256, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTransport } from "../monad-rpc.ts";
import { readPaymasterSigner } from "../paymaster-signer.ts";
import { testnetWalletChain } from "./app-wallet-chain.ts";
import { operationStore } from "./operation-store.server.ts";
import { runProductOperation } from "./operation-runner.ts";
export const DAILY_GAS_ALLOWANCE = 1_000_000_000_000_000_000n; // 1 testnet MON / APP wallet / UTC day.
export async function initializeGasSchema() {
  const sql = mediaSql();
  await sql`CREATE TABLE IF NOT EXISTS aim_gas_allowance (wallet text NOT NULL, day date NOT NULL, amount numeric(78,0) NOT NULL, PRIMARY KEY(wallet,day))`;
  await sql`CREATE TABLE IF NOT EXISTS aim_gas_reservations (request_id uuid PRIMARY KEY, wallet text NOT NULL, amount numeric(78,0) NOT NULL)`;
}
/** Invoked under the shared sponsor lock; a crash may consume quota, never expand it. */
async function reserveGas(wallet: Address, requestId: string, amount: bigint) {
  const sql = mediaSql(),
    address = wallet.toLowerCase();
  const existing =
    await sql`SELECT request_id FROM aim_gas_reservations WHERE request_id=${requestId}`;
  if (existing.length) return;
  const granted =
    await sql`INSERT INTO aim_gas_allowance(wallet,day,amount) VALUES (${address},(now() AT TIME ZONE 'UTC')::date,${amount.toString()}::numeric)
    ON CONFLICT(wallet,day) DO UPDATE SET amount=aim_gas_allowance.amount+EXCLUDED.amount
    WHERE aim_gas_allowance.amount+EXCLUDED.amount<=${DAILY_GAS_ALLOWANCE.toString()}::numeric RETURNING amount`;
  if (!granted.length) throw new Error("Daily testnet gas allowance exhausted");
  await sql`INSERT INTO aim_gas_reservations(request_id,wallet,amount) VALUES (${requestId},${address},${amount.toString()}::numeric)`;
}
export const SPONSORED_GAS = 300_000n;
export const MAX_PRODUCT_GAS = 2_000_000n;
export const MAX_SPONSORED_FEE = 200_000_000_000n;
/** Monad `eth_maxPriorityFeePerGas` is hardcoded at 2 gwei; 0-tip txs are dropped. */
export const MONAD_PRIORITY_FEE = 2_000_000_000n;
/** Category Labs 7.5% gas-limit margin. Monad charges the limit, not gas used. */
export const MONAD_GAS_LIMIT_MARGIN_BPS = 10_750n;
export function sponsorAccount() {
  return privateKeyToAccount(readPaymasterSigner());
}
export function productGasLimit(estimated: bigint, cap = MAX_PRODUCT_GAS) {
  const base = estimated < 21_000n ? 21_000n : estimated;
  const buffered = (base * MONAD_GAS_LIMIT_MARGIN_BPS + 9_999n) / 10_000n;
  const gas = buffered > cap ? cap : buffered;
  if (gas < 21_000n || gas > cap) throw new Error("Invalid sponsored gas limit");
  return gas;
}
export function gasBudget(baseFee: bigint, gas = SPONSORED_GAS) {
  if (gas < 21_000n || gas > MAX_PRODUCT_GAS) throw new Error("Invalid sponsored gas limit");
  // Prefer a 2x+1 gwei buffer, but clamp to the 200 gwei cap so a 100 gwei Monad
  // testnet base fee can still sponsor instead of aborting every product send.
  const buffered = baseFee * 2n + 1_000_000_000n;
  const maxFeePerGas = buffered > MAX_SPONSORED_FEE ? MAX_SPONSORED_FEE : buffered;
  if (maxFeePerGas < baseFee) throw new Error("Testnet gas exceeds sponsorship limit");
  const maxPriorityFeePerGas =
    MONAD_PRIORITY_FEE < maxFeePerGas ? MONAD_PRIORITY_FEE : maxFeePerGas;
  return { gas, maxFeePerGas, maxPriorityFeePerGas };
}
export function sponsorshipId(wallet: Address, requestId: string, index: number) {
  const h = createHash("sha256")
    .update(`aim/testnet-gas/v1:${wallet.toLowerCase()}:${requestId}:${index}`)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export type GasPorts = {
  chainId(): Promise<number>;
  baseFee(): Promise<bigint>;
  balance(wallet: Address): Promise<bigint>;
  sponsor: Address;
  store(requestId: string, bodyHash: string): import("./operation-runner.ts").OperationStore;
  reserve(wallet: Address, requestId: string, amount: bigint): Promise<void>;
  sign(wallet: Address, amount: bigint, budget: ReturnType<typeof gasBudget>): Promise<Hex>;
  send(hash: Hex): Promise<void>;
  confirmed(hash: Hex): Promise<boolean>;
};
export async function fundTestnetGas(
  wallet: Address,
  parentId: string,
  index: number,
  ports: GasPorts,
  gas = SPONSORED_GAS,
) {
  if ((await ports.chainId()) !== 10143) throw new Error("Wrong sponsorship chain");
  const budget = gasBudget(await ports.baseFee(), gas),
    needed = budget.gas * budget.maxFeePerGas;
  if (ports.sponsor.toLowerCase() === wallet.toLowerCase())
    throw new Error("Invalid gas recipient");
  const requestId = sponsorshipId(wallet, parentId, index);
  const bodyHash = createHash("sha256")
    .update(`10143:${wallet.toLowerCase()}:gas-v1${gas === SPONSORED_GAS ? "" : `:${gas}`}`)
    .digest("hex");
  // Full funding even if the user already has MON. Do not substitute the user's funds.
  const result = await runProductOperation(
    bodyHash,
    async () => [needed],
    ports.store(requestId, bodyHash),
    {
      async sign(value) {
        await ports.reserve(wallet, requestId, value);
        return ports.sign(wallet, value, budget);
      },
      send: (hash) => ports.send(hash),
      confirmed: (hash) => ports.confirmed(hash),
    },
  );
  if (result.status !== "confirmed")
    throw new Error("Gas sponsorship pending; retry the same request");
  if ((await ports.balance(wallet)) < needed)
    throw new Error("Sponsored gas unavailable; review original request");
  return budget;
}
/** Native gas top-up only; the APP wallet still signs the allowlisted LUSD call. */
export async function sponsorTestnetGas(
  wallet: Address,
  parentId: string,
  index: number,
  gas = SPONSORED_GAS,
) {
  const reader = createPublicClient({
    chain: testnetWalletChain,
    transport: monadTransport(10143),
  });
  const sponsor = sponsorAccount();
  const writer = createWalletClient({
    account: sponsor,
    chain: testnetWalletChain,
    transport: monadTransport(10143),
  });
  let signed: Hex | undefined;
  return fundTestnetGas(
    wallet,
    parentId,
    index,
    {
      chainId: () => reader.getChainId(),
      baseFee: async () => (await reader.getBlock()).baseFeePerGas ?? 0n,
      balance: (address) => reader.getBalance({ address }),
      sponsor: sponsor.address,
      store: (id, body) =>
        operationStore(`sponsor:10143:${sponsor.address.toLowerCase()}`, id, body, (hash) =>
          reader
            .getTransactionReceipt({ hash })
            .then((r) => r.status)
            .catch(() => null),
        ),
      reserve: reserveGas,
      async sign(to, value, budget) {
        const request = await writer.prepareTransactionRequest({
          account: sponsor,
          to,
          value,
          chain: testnetWalletChain,
          type: "eip1559",
          gas: 21_000n,
          maxFeePerGas: budget.maxFeePerGas,
          maxPriorityFeePerGas: budget.maxPriorityFeePerGas,
        });
        if (request.chainId !== 10143 || value > budget.gas * MAX_SPONSORED_FEE)
          throw new Error("Invalid sponsorship");
        signed = await sponsor.signTransaction(request);
        return keccak256(signed);
      },
      async send(hash) {
        const sent = await writer.sendRawTransaction({ serializedTransaction: signed! });
        signed = undefined;
        if (sent !== hash) throw new Error("Unexpected gas transaction");
      },
      async confirmed(hash) {
        return (
          (await reader.waitForTransactionReceipt({ hash, timeout: 12_000 })).status === "success"
        );
      },
    },
    gas,
  );
}
