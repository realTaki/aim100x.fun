import { z } from "zod";
import { encodeFunctionData, erc20Abi, getAddress, parseAbi, type Address, type Hex } from "viem";
import { IDOLS100X_ADDRESS, IDOLS100X_FAN_ABI, IDOLS100X_IDOL_ABI, LONELY_USD_ADDRESS, DEFAULT_SALE_PRICE_USDC_ATOMIC } from "../idols100x.ts";
import { LONELY_USD_ABI } from "../lonely-usd.ts";
const tokenId = z.number().int().positive().safe();
const amount = z.string().regex(/^(0|[1-9]\d{0,9})$/).refine(v => BigInt(v) <= 1_000_000_000n, "Maximum 1000 LUSD per operation");
export const actionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("faucet") }).strict(), z.object({ kind: z.literal("removeAgent") }).strict(),
  z.object({ kind: z.literal("mint"), maxAmount: amount }).strict(),
  z.object({ kind: z.literal("subscribe"), tokenId, maxAmount: amount }).strict(),
  z.object({ kind: z.literal("buy"), tokenId, maxAmount: amount }).strict(),
  z.object({ kind: z.literal("tip"), tokenId, amount }).strict(),
  z.object({ kind: z.literal("sale"), tokenId, amount }).strict(),
  z.object({ kind: z.literal("pricing"), tokenId, subscribe: amount, image: amount }).strict(),
  z.object({ kind: z.literal("agent"), agent: z.string().regex(/^0x[a-fA-F0-9]{40}$/), role: z.union([z.literal(1), z.literal(2)]) }).strict(),
  z.object({ kind: z.literal("withdraw"), tokenId }).strict(),
  z.object({ kind: z.literal("image"), imageId: z.string().min(1).max(100), paymentIntent: z.string().min(1).max(12000) }).strict(),
]);
export type ProductCall = { to: Address; data: Hex; value: bigint };
export type PolicyReader = {
  owner(token: number): Promise<Address>;
  price(token: number, kind: "subscribe" | "buy"): Promise<bigint>;
  tba(token: number): Promise<Address>;
  balance(address: Address): Promise<bigint>;
  image(imageId: string, ticket: string): Promise<{ calls: { to: Address; data: Hex }[]; amount: string }>;
};
const collection = (data: Hex): ProductCall => ({ to: IDOLS100X_ADDRESS, data, value: 0n });
export async function planProductAction(raw: unknown, wallet: Address, reader: PolicyReader): Promise<ProductCall[]> {
  const a = actionSchema.parse(raw);
  const same = (one: string, two: string) => one.toLowerCase() === two.toLowerCase();
  const requireOwner = async (id: number) => { if (!same(await reader.owner(id), wallet)) throw new Error("Not the idol owner"); };
  const paid = (cost: bigint, data: Hex): ProductCall[] => {
    if (cost <= 0n || cost > 1_000_000_000n) throw new Error("Invalid product amount");
    return [{ to: LONELY_USD_ADDRESS, value: 0n, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [IDOLS100X_ADDRESS, cost] }) }, collection(data)];
  };
  switch (a.kind) {
    case "faucet": return [{ to: LONELY_USD_ADDRESS, value: 0n, data: encodeFunctionData({ abi: LONELY_USD_ABI, functionName: "faucet" }) }];
    case "removeAgent": return [collection(encodeFunctionData({ abi: IDOLS100X_IDOL_ABI, functionName: "removeAgent" }))];
    case "agent": {
      const agent = getAddress(a.agent);
      if (/^0x0{40}$/i.test(agent) || same(agent, wallet)) throw new Error("Invalid Agent Account");
      return [collection(encodeFunctionData({ abi: IDOLS100X_IDOL_ABI, functionName: "setAgent", args: [agent, a.role] }))];
    }
    case "mint": {
      if (DEFAULT_SALE_PRICE_USDC_ATOMIC > BigInt(a.maxAmount)) throw new Error("Price exceeds confirmation");
      return paid(DEFAULT_SALE_PRICE_USDC_ATOMIC, encodeFunctionData({ abi: IDOLS100X_IDOL_ABI, functionName: "mint" }));
    }
    case "subscribe": case "buy": {
      const price = await reader.price(a.tokenId, a.kind);
      if (price > BigInt(a.maxAmount)) throw new Error("Price exceeds confirmation");
      return paid(price, a.kind === "subscribe"
        ? encodeFunctionData({ abi: IDOLS100X_FAN_ABI, functionName: "subscribe", args: [BigInt(a.tokenId)] })
        : encodeFunctionData({ abi: IDOLS100X_IDOL_ABI, functionName: "buy", args: [BigInt(a.tokenId)] }));
    }
    case "tip": return paid(BigInt(a.amount), encodeFunctionData({ abi: IDOLS100X_FAN_ABI, functionName: "pay", args: [BigInt(a.tokenId), BigInt(a.amount)] }));
    case "sale":
      await requireOwner(a.tokenId);
      return [collection(encodeFunctionData({ abi: IDOLS100X_IDOL_ABI, functionName: "setSalePrice", args: [BigInt(a.tokenId), BigInt(a.amount)] }))];
    case "pricing":
      await requireOwner(a.tokenId);
      if (BigInt(a.subscribe) <= 0n || BigInt(a.image) <= 0n) throw new Error("Invalid price");
      return [collection(encodeFunctionData({ abi: IDOLS100X_IDOL_ABI, functionName: "setIdolPricing", args: [BigInt(a.tokenId), { subscribePriceUsdc: BigInt(a.subscribe), imageUnlockPriceUsdc: BigInt(a.image) }] }))];
    case "withdraw": {
      await requireOwner(a.tokenId);
      const tba = await reader.tba(a.tokenId), balance = await reader.balance(tba);
      if (balance <= 0n) throw new Error("No TBA balance");
      const transfer = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [wallet, balance] });
      return [{ to: tba, value: 0n, data: encodeFunctionData({ abi: parseAbi(["function execute(address,uint256,bytes,uint8) payable returns(bytes)"]), functionName: "execute", args: [LONELY_USD_ADDRESS, 0n, transfer, 0] }) }];
    }
    case "image": {
      const result = await reader.image(a.imageId, a.paymentIntent);
      amount.parse(result.amount);
      const calls = result.calls.map(c => ({ to: getAddress(c.to), data: c.data, value: 0n }));
      if (
        calls.length !== 2 ||
        calls[0].to.toLowerCase() !== LONELY_USD_ADDRESS.toLowerCase() ||
        calls[1].to.toLowerCase() !== IDOLS100X_ADDRESS.toLowerCase() ||
        BigInt(result.amount) <= 0n
      ) throw new Error("Invalid image payment");
      return calls;
    }
  }
}
