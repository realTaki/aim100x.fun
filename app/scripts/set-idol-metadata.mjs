#!/usr/bin/env node
/**
 * Set named on-chain idol fields for minted tokens 1–4 (Monad 10143).
 * Uses PAYMASTER_SIGNER (Grokbot / GROKBOT_WEB3_WALLET) — never log the key.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readPaymasterSigner } from "./paymaster-signer.mjs";

const RPC = "https://testnet-rpc.monad.xyz";
const ADDRESS =
  process.env.IDOLS100X_ADDRESS || "0xeB88B15911431c4F3903F5780AB584E7CD6022cB";
const TOKEN_IDS = [1, 2, 3, 4];
const DEFAULT_PRICE = 1_000_000n;

function loadKey() {
  return readPaymasterSigner();
}

const abi = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function setIdolContent(uint256 tokenId,(string name,string bio,string personality,string look,string voice,string website,string twitter,string scenes) input)",
  "function setIdolPricing(uint256 tokenId,(uint256 subscribePriceUsdc,uint256 imageUnlockPriceUsdc) input)",
  "function setWelcome(uint256 tokenId,string welcome)",
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

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const root = join(repoRoot, "contracts/metadata");

for (const tokenId of TOKEN_IDS) {
  try {
    await publicClient.readContract({
      address: ADDRESS,
      abi,
      functionName: "ownerOf",
      args: [BigInt(tokenId)],
    });
  } catch {
    console.log(`skip unminted ${tokenId}`);
    continue;
  }
  const json = JSON.parse(readFileSync(join(root, `${tokenId}.json`), "utf8"));
  const scenes = readFileSync(join(root, `${tokenId}.scenes.json`), "utf8").trim();
  const content = {
    name: json.name ?? "",
    bio: json.bio ?? "",
    personality: json.personality ?? "",
    look: json.look ?? "",
    voice: json.voice ?? "Chinese (Mandarin)_Warm_Girl",
    website: json.website ?? "",
    twitter: json.twitter ?? "",
    scenes,
  };
  const contentHash = await walletClient.writeContract({
    address: ADDRESS,
    abi,
    functionName: "setIdolContent",
    args: [BigInt(tokenId), content],
  });
  await publicClient.waitForTransactionReceipt({ hash: contentHash });
  const welcomeHash = await walletClient.writeContract({
    address: ADDRESS,
    abi,
    functionName: "setWelcome",
    args: [BigInt(tokenId), json.welcome ?? ""],
  });
  await publicClient.waitForTransactionReceipt({ hash: welcomeHash });
  const priceHash = await walletClient.writeContract({
    address: ADDRESS,
    abi,
    functionName: "setIdolPricing",
    args: [
      BigInt(tokenId),
      {
        subscribePriceUsdc: DEFAULT_PRICE,
        imageUnlockPriceUsdc: DEFAULT_PRICE,
      },
    ],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: priceHash });
  console.log(JSON.stringify({ tokenId, tx: priceHash, status: receipt.status }));
}
