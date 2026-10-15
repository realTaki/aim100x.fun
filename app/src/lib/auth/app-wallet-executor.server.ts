import { monadTransport } from "../monad-rpc.ts";
import { rejectMainnetSpending } from "./mainnet-disabled.server.ts";
import { createPublicClient, createWalletClient, parseAbi, type Chain } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { readPaymasterSigner } from "../paymaster-signer.ts";
import {
  APP_ACCOUNT_IMPLEMENTATION,
  APP_ENTRY_POINT,
  mainnetWalletChain,
  testnetWalletChain,
} from "./app-wallet-chain.ts";
import { appWalletDelegationCode } from "./app-wallet-7702.ts";
import { gasBudget, productGasLimit } from "./testnet-gas.server.ts";

const DELEGATION_GAS_CAP = 200_000n;

/** Delegate only the server-derived APP wallet on testnet; mainnet stays hard-disabled. */
export async function ensureAppWalletDelegation(owner: PrivateKeyAccount, chain: Chain) {
  if (chain.id === mainnetWalletChain.id) rejectMainnetSpending();
  if (chain.id !== testnetWalletChain.id) throw new Error("API wallet delegation is testnet-only");
  const reader = createPublicClient({
    chain,
    transport: monadTransport(chain.id),
  });
  if ((await reader.getChainId()) !== chain.id) throw new Error("Wallet RPC chain mismatch");
  const delegate = appWalletDelegationCode();
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
  const budget = gasBudget((await reader.getBlock()).baseFeePerGas ?? 0n, DELEGATION_GAS_CAP);
  const gas = productGasLimit(80_000n, DELEGATION_GAS_CAP);
  const request = await writer.prepareTransactionRequest({
    account: sponsor,
    chain,
    type: "eip7702",
    to: owner.address,
    data: "0x",
    value: 0n,
    authorizationList,
    gas,
    maxFeePerGas: budget.maxFeePerGas,
    maxPriorityFeePerGas: budget.maxPriorityFeePerGas,
  });
  if (
    request.chainId !== chain.id ||
    (request.value ?? 0n) !== 0n ||
    request.nonce == null ||
    request.gas == null ||
    request.maxFeePerGas == null ||
    request.maxPriorityFeePerGas == null
  )
    throw new Error("Invalid delegation transaction");
  const hash = await writer.sendRawTransaction({
    serializedTransaction: await sponsor.signTransaction({
      chainId: chain.id,
      type: "eip7702",
      to: owner.address,
      data: "0x",
      value: 0n,
      nonce: request.nonce,
      gas: request.gas,
      maxFeePerGas: request.maxFeePerGas,
      maxPriorityFeePerGas: request.maxPriorityFeePerGas,
      authorizationList,
    }),
  });
  const receipt = await reader.waitForTransactionReceipt({ hash, timeout: 30_000 });
  if (
    receipt.status !== "success" ||
    (await reader.getCode({ address: owner.address }))?.toLowerCase() !== delegate
  )
    throw new Error("Wallet delegation failed");
}
