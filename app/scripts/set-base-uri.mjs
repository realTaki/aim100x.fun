#!/usr/bin/env node
/**
 * Owner-only `setBaseURI` on the live Idols100x (Monad 10143).
 * Does not transfer tokens. Uses PAYMASTER_SIGNER (Grokbot / GROKBOT_WEB3_WALLET) — never log the key.
 */
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readPaymasterSigner } from "./paymaster-signer.mjs";

const RPC = "https://testnet-rpc.monad.xyz";
const ADDRESS = (
  process.env.IDOLS100X_ADDRESS || "0xeB88B15911431c4F3903F5780AB584E7CD6022cB"
).toLowerCase();
const BASE_URI =
  process.env.IDOLS100X_BASE_URI || "https://aim100x.fun/api/metadata/";

function loadKey() {
  return readPaymasterSigner();
}

const abi = parseAbi([
  "function owner() view returns (address)",
  "function baseURI() view returns (string)",
  "function setBaseURI(string baseURI_)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function ownerOf(uint256 tokenId) view returns (address)",
]);

const chain = {
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};

const account = privateKeyToAccount(loadKey());
const publicClient = createPublicClient({ chain, transport: http(RPC) });
const walletClient = createWalletClient({
  account,
  chain,
  transport: http(RPC),
});

const owner = await publicClient.readContract({
  address: ADDRESS,
  abi,
  functionName: "owner",
});
if (owner.toLowerCase() !== account.address.toLowerCase()) {
  throw new Error(`signer is not contract owner (${owner})`);
}

const before = await publicClient.readContract({
  address: ADDRESS,
  abi,
  functionName: "baseURI",
});
const hash = await walletClient.writeContract({
  address: ADDRESS,
  abi,
  functionName: "setBaseURI",
  args: [BASE_URI],
});
const after = await publicClient.waitForTransactionReceipt({ hash });
const baseURI = await publicClient.readContract({
  address: ADDRESS,
  abi,
  functionName: "baseURI",
});
const tokenURI1 = await publicClient.readContract({
  address: ADDRESS,
  abi,
  functionName: "tokenURI",
  args: [1n],
});
const ownerOf1 = await publicClient.readContract({
  address: ADDRESS,
  abi,
  functionName: "ownerOf",
  args: [1n],
});

console.log(
  JSON.stringify({
    address: ADDRESS,
    tx: hash,
    status: after.status,
    before,
    baseURI,
    tokenURI1,
    ownerOf1,
  }),
);
