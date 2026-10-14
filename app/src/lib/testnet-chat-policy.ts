import { encodeFunctionData, erc20Abi, keccak256, stringToHex, type Address, type Hex } from "viem";
import { LONELY_USD_ADDRESS } from "./idols100x.ts";
export const TEXT_CHAT_COST = 1_000_000n;
export const TEXT_CHAT_PRICE_LABEL = "1 testnet LUSD / message · gas sponsored";
export function textPaymentCall(
  wallet: Address,
  recipient: Address,
  requestId: string,
  bodyHash: string,
) {
  const tag = keccak256(
    stringToHex(`aim/text/10143/v1:${wallet.toLowerCase()}:${requestId}:${bodyHash}`),
  );
  return {
    to: LONELY_USD_ADDRESS,
    value: 0n,
    data: (encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [recipient, TEXT_CHAT_COST],
    }) + tag.slice(2)) as Hex,
  };
}
