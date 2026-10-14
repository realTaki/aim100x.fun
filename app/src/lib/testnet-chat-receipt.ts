import { decodeEventLog, erc20Abi, type Address, type Hex } from "viem";
import { LONELY_USD_ADDRESS } from "./idols100x.ts";
import { TEXT_CHAT_COST, textPaymentCall } from "./testnet-chat-policy.ts";
export type PaymentEvidence = {
  chainId: number;
  transaction: {
    hash: Hex;
    from: Address;
    to: Address | null;
    input: Hex;
    value: bigint;
    chainId?: number;
    blockHash: Hex | null;
  };
  receipt: {
    transactionHash: Hex;
    status: string;
    from: Address;
    to: Address | null;
    blockHash: Hex;
    logs: readonly { address: Address; data: Hex; topics: readonly Hex[]; removed?: boolean }[];
  };
};
/** Never accept a browser balance, "paid" flag or arbitrary transaction hash as proof. */
export function verifyTextPayment(
  e: PaymentEvidence,
  hash: Hex,
  wallet: Address,
  recipient: Address,
  requestId: string,
  bodyHash: string,
) {
  const same = (a: string | null, b: string) => a?.toLowerCase() === b.toLowerCase();
  const call = textPaymentCall(wallet, recipient, requestId, bodyHash),
    t = e.transaction,
    r = e.receipt;
  if (
    e.chainId !== 10143 ||
    t.chainId !== 10143 ||
    !same(t.hash, hash) ||
    !same(r.transactionHash, hash) ||
    r.status !== "success" ||
    !same(t.from, wallet) ||
    !same(r.from, wallet) ||
    !same(t.to, LONELY_USD_ADDRESS) ||
    !same(r.to, LONELY_USD_ADDRESS) ||
    t.value !== 0n ||
    !same(t.input, call.data) ||
    !same(t.blockHash, r.blockHash)
  )
    throw new Error("Invalid testnet chat payment");
  const transfers = r.logs.filter((log) => {
    if (!same(log.address, LONELY_USD_ADDRESS) || log.removed) return false;
    try {
      const event = decodeEventLog({
        abi: erc20Abi,
        eventName: "Transfer",
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      });
      return (
        same(event.args.from, wallet) &&
        same(event.args.to, recipient) &&
        event.args.value === TEXT_CHAT_COST
      );
    } catch {
      return false;
    }
  });
  if (transfers.length !== 1) throw new Error("Missing exact LUSD Transfer receipt");
}
