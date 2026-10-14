import { monadTransport } from "../monad-rpc.ts";
import { rejectMainnetSpending } from "./mainnet-disabled.server.ts";
import { createPublicClient, createWalletClient, http, parseAbi, type Chain } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { readPaymasterSigner } from "../paymaster-signer.ts";
import {
  APP_ACCOUNT_IMPLEMENTATION,
  APP_ENTRY_POINT,
  mainnetWalletChain,
} from "./app-wallet-chain.ts";

/** Delegate only the server-derived account; never replace another implementation. */
export async function ensureAppWalletDelegation(owner: PrivateKeyAccount, chain: Chain) {
  rejectMainnetSpending();
  if (chain.id !== mainnetWalletChain.id) throw new Error("API wallet delegation is mainnet-only");
  const reader = createPublicClient({
    chain,
    transport: monadTransport(chain.id),
  });
  if ((await reader.getChainId()) !== chain.id) throw new Error("Wallet RPC chain mismatch");
  const delegate = `0xef0100${APP_ACCOUNT_IMPLEMENTATION.slice(2)}`.toLowerCase();
  const [code, implementation, epCode] = await Promise.all([
    reader.getCode({ address: owner.address }),
    reader.getCode({ address: APP_ACCOUNT_IMPLEMENTATION }),
    reader.getCode({ address: APP_ENTRY_POINT }),
  ]);
  if (!implementation || implementation === "0x" || !epCode || epCode === "0x")
    throw new Error(`7702 infrastructure is unavailable on chain ${chain.id}`);
  const ep = await reader.readContract({
    address: APP_ACCOUNT_IMPLEMENTATION,
    abi: parseAbi(["function entryPoint() view returns(address)"]),
    functionName: "entryPoint",
  });
  if (ep.toLowerCase() !== APP_ENTRY_POINT.toLowerCase())
    throw new Error("Unexpected 7702 implementation");
  if (code?.toLowerCase() === delegate) return;
  if (code && code !== "0x") throw new Error("Refusing to overwrite another wallet delegation");
  const sponsor = privateKeyToAccount(readPaymasterSigner());
  if (owner.address.toLowerCase() === sponsor.address.toLowerCase())
    throw new Error("Sponsor cannot be user");
  const authorizationList = [
    await owner.signAuthorization({
      chainId: chain.id,
      address: APP_ACCOUNT_IMPLEMENTATION,
      nonce: await reader.getTransactionCount({ address: owner.address, blockTag: "pending" }),
    }),
  ];
  const writer = createWalletClient({
    chain,
    account: sponsor,
    transport: monadTransport(chain.id),
  });
  const baseFee = (await reader.getBlock()).baseFeePerGas ?? 0n;
  const maxFeePerGas = baseFee * 2n + 1_000_000_000n;
  if (maxFeePerGas > 200_000_000_000n)
    throw new Error("Network gas price exceeds sponsorship limit");
  const gas = await reader.estimateGas({
    account: sponsor,
    to: owner.address,
    data: "0x",
    authorizationList,
  });
  if (gas > 200_000n) throw new Error("Delegation exceeds sponsorship gas limit");
  const hash = await writer.sendTransaction({
    to: owner.address,
    data: "0x",
    authorizationList,
    gas: (gas * 12n) / 10n + 10_000n,
    maxFeePerGas,
    maxPriorityFeePerGas: 0n,
  });
  const receipt = await reader.waitForTransactionReceipt({ hash, timeout: 30_000 });
  if (
    receipt.status !== "success" ||
    (await reader.getCode({ address: owner.address }))?.toLowerCase() !== delegate
  )
    throw new Error("Wallet delegation failed");
}
