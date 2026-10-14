import { monadTransport } from "../monad-rpc.ts";
import {
  createPublicClient,
  createWalletClient,
  custom,
  getAddress,
  http,
  type Address,
  type Chain,
  type EIP1193Provider,
  type Hex,
} from "viem";
import { externalProviderFor } from "./external-wallet-provider.ts";
import { testnetWalletChain } from "./app-wallet-chain.ts";
export type ExternalCall = { to: Address; data: Hex; value?: bigint };
function unknownChain(error: unknown): boolean {
  let cause = error;
  for (let i = 0; cause && typeof cause === "object" && i < 8; i++) {
    if ("code" in cause && cause.code === 4902) return true;
    cause = "cause" in cause ? cause.cause : undefined;
  }
  return false;
}
export async function externalSigningClient(
  expected: Address,
  chain: Chain,
  provider?: EIP1193Provider,
) {
  const wallet = createWalletClient({
    chain,
    transport: custom(provider ?? (await externalProviderFor(expected)), { retryCount: 0 }),
  });
  const [address] = await wallet.requestAddresses();
  if (!address || address.toLowerCase() !== expected.toLowerCase())
    throw new Error("Connect the wallet used to sign in. Sign in again after switching accounts.");
  if ((await wallet.getChainId()) !== chain.id) {
    try {
      await wallet.switchChain({ id: chain.id });
    } catch (error) {
      if (!unknownChain(error)) throw error;
      await wallet.addChain({ chain });
      await wallet.switchChain({ id: chain.id });
    }
  }
  if ((await wallet.getChainId()) !== chain.id)
    throw new Error("External wallet is on the wrong network");
  return wallet;
}
/** Product calls are ordinary external-wallet transactions: user signs and pays gas. */
export async function executeExternalCalls(
  expected: Address,
  calls: ExternalCall[],
  deps: {
    provider?: EIP1193Provider;
    onSubmitted?: (hash: Hex, index: number) => void;
    waitForReceipt?: (hash: Hex) => Promise<{ status: "success" | "reverted" }>;
  } = {},
): Promise<Hex> {
  if (calls.length < 1 || calls.length > 8) throw new Error("Invalid calls");
  const wallet = await externalSigningClient(expected, testnetWalletChain, deps.provider);
  const reader = createPublicClient({
    chain: testnetWalletChain,
    transport: monadTransport(10143),
  });
  const wait =
    deps.waitForReceipt ?? ((hash) => reader.waitForTransactionReceipt({ hash, timeout: 30_000 }));
  let hash: Hex | undefined;
  for (const [index, call] of calls.entries()) {
    // Check again after approvals: a wallet can change accounts while showing a prompt.
    const [active] = await wallet.getAddresses();
    if (active?.toLowerCase() !== expected.toLowerCase())
      throw new Error("Wallet account changed. Sign in again.");
    if ((await wallet.getChainId()) !== testnetWalletChain.id)
      throw new Error("Wallet network changed");
    hash = await wallet.sendTransaction({
      account: getAddress(expected),
      chain: testnetWalletChain,
      to: call.to,
      data: call.data,
      value: call.value ?? 0n,
    });
    deps.onSubmitted?.(hash, index);
    const receipt = await wait(hash).catch(() => {
      throw new Error(
        `Transaction submitted: ${hash}. Check its on-chain status before trying again to avoid a duplicate payment.`,
      );
    });
    if (receipt.status !== "success") throw new Error(`Transaction failed: ${hash}`);
  }
  return hash!;
}
