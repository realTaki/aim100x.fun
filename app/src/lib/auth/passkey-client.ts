import type { Address } from "viem";
import { executeProductAction } from "./product-wallet-client";
import { appWalletAddress } from "./app-wallet-client";
// Legacy names retained; all active product actions use the derived APP wallet.
export const isPasskeyClientSession = () => appWalletAddress() !== null;
export const passkeyFaucet = () => executeProductAction({ kind: "faucet" });
export const passkeySubscribe = (tokenId: number, amount: bigint) => executeProductAction({ kind: "subscribe", tokenId, maxAmount: amount.toString() });
export const passkeyPay = (tokenId: number, amount: bigint) => executeProductAction({ kind: "tip", tokenId, amount: amount.toString() });
export const passkeyMint = (amount: bigint) => executeProductAction({ kind: "mint", maxAmount: amount.toString() });
export const passkeyBuy = (tokenId: number, amount: bigint) => executeProductAction({ kind: "buy", tokenId, maxAmount: amount.toString() });
export const passkeySetSalePrice = (tokenId: number, price: bigint) => executeProductAction({ kind: "sale", tokenId, amount: price.toString() });
export const passkeySetAgent = (agent: Address, role: 1 | 2) => executeProductAction({ kind: "agent", agent, role });
export const passkeyRemoveAgent = () => executeProductAction({ kind: "removeAgent" });
export const passkeySetIdolPricing = (tokenId: number, p: { subscribePriceUsdc: bigint; imageUnlockPriceUsdc: bigint }) => executeProductAction({ kind: "pricing", tokenId, subscribe: p.subscribePriceUsdc.toString(), image: p.imageUnlockPriceUsdc.toString() });
export const passkeyWithdrawTba = (tokenId: number) => executeProductAction({ kind: "withdraw", tokenId });
