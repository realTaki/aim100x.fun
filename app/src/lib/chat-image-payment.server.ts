import { monadTransport } from "./monad-rpc.ts";
import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import {
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  decodeEventLog,
  parseAbi,
  keccak256,
  stringToHex,
  type Address,
  type Hex,
} from "viem";
import { sessionSigningKey } from "./auth/app-wallet.server.ts";
import { APP_ENTRY_POINT, testnetWalletChain } from "./auth/app-wallet-chain.ts";
import { sponsoredCallFromHandleOps } from "./auth/app-wallet-7702.ts";
import {
  IDOLS100X_ADDRESS,
  IDOLS100X_CHAIN_ID,
  IDOLS100X_FAN_ABI,
  LONELY_USD_ADDRESS,
} from "./idols100x.ts";
import { requireAvailablePaymentImage } from "./chat-image-availability.server.ts";
import { normalizeMediaId } from "./media-app-id.ts";
const issuer = "aim100x.fun/chat-image/v1";
export type ImagePayment = {
  imageId: string;
  tokenId: number;
  amount: string;
  wallet: Address;
  fromBlock: string;
  chainId: number;
  collectionAddress: Address;
  checkoutId: string;
};
export const imagePaymentReader = () =>
  createPublicClient({
    chain: testnetWalletChain,
    transport: monadTransport(10143),
  });
export async function issueImagePayment(
  userId: string,
  input: Omit<ImagePayment, "checkoutId" | "chainId" | "collectionAddress">,
) {
  return new SignJWT({
    ...input,
    imageId: normalizeMediaId(input.imageId),
    chainId: IDOLS100X_CHAIN_ID,
    collectionAddress: IDOLS100X_ADDRESS,
    checkoutId: randomUUID(),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(issuer)
    .setAudience("payment")
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(sessionSigningKey());
}
export async function verifyImagePayment(
  ticket: string,
  userId: string,
  imageId: string,
  wallet: Address,
): Promise<ImagePayment> {
  const { payload: p } = await jwtVerify(ticket, sessionSigningKey(), {
    algorithms: ["HS256"],
    issuer,
    audience: "payment",
  });
  if (
    p.sub !== userId ||
    p.imageId !== normalizeMediaId(imageId) ||
    typeof p.wallet !== "string" ||
    p.wallet.toLowerCase() !== wallet.toLowerCase() ||
    p.chainId !== IDOLS100X_CHAIN_ID ||
    p.collectionAddress !== IDOLS100X_ADDRESS ||
    typeof p.checkoutId !== "string" ||
    !/^[a-f0-9-]{36}$/.test(p.checkoutId) ||
    !Number.isSafeInteger(p.tokenId) ||
    Number(p.tokenId) < 1 ||
    typeof p.amount !== "string" ||
    !/^[1-9]\d{0,29}$/.test(p.amount) ||
    typeof p.fromBlock !== "string" ||
    !/^\d+$/.test(p.fromBlock)
  )
    throw new Error("Invalid image payment authorization");
  return p as unknown as ImagePayment;
}
export function imagePaymentCalls(p: ImagePayment) {
  // Solidity accepts trailing calldata. Bind a normal pay() transaction to one unique
  // checkout so the same receipt cannot unlock another photo. No new contract is needed.
  const tag = keccak256(stringToHex(`${issuer}/${p.checkoutId}`));
  const pay = encodeFunctionData({
    abi: IDOLS100X_FAN_ABI,
    functionName: "pay",
    args: [BigInt(p.tokenId), BigInt(p.amount)],
  });
  return [
    {
      to: LONELY_USD_ADDRESS,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [IDOLS100X_ADDRESS, BigInt(p.amount)],
      }),
    },
    { to: IDOLS100X_ADDRESS, data: `${pay}${tag.slice(2)}` as Hex },
  ];
}
export async function prepareImagePayment(
  userId: string,
  wallet: Address,
  imageId: string,
  ticket: string,
  available = requireAvailablePaymentImage,
) {
  const p = await verifyImagePayment(ticket, userId, imageId, wallet);
  await available(p.imageId, p.tokenId);
  return { calls: imagePaymentCalls(p), amount: p.amount };
}
const paidAbi = parseAbi([
  "event Paid(address indexed payer, uint256 indexed tokenId, uint256 amount)",
]);
/** Read-only confirmation of an exact checkout inside the sponsored APP call. */
export async function settleImagePayment(
  userId: string,
  wallet: Address,
  imageId: string,
  ticket: string,
  hash: Hex,
  deps = { reader: imagePaymentReader, available: requireAvailablePaymentImage },
) {
  if (!/^0x[a-f0-9]{64}$/i.test(hash)) throw new Error("Invalid payment transaction");
  const p = await verifyImagePayment(ticket, userId, imageId, wallet);
  const reader = deps.reader();
  if ((await reader.getChainId()) !== IDOLS100X_CHAIN_ID)
    throw new Error("Payment RPC chain mismatch");
  const [tx, receipt] = await Promise.all([
    reader.getTransaction({ hash }),
    reader.getTransactionReceipt({ hash }),
  ]);
  const same = (a: string | null | undefined, b: string) => a?.toLowerCase() === b.toLowerCase();
  const inner = sponsoredCallFromHandleOps(tx.input);
  if (
    receipt.status !== "success" ||
    tx.chainId !== IDOLS100X_CHAIN_ID ||
    !same(tx.hash, hash) ||
    !same(receipt.transactionHash, hash) ||
    !tx.blockNumber ||
    tx.blockNumber < BigInt(p.fromBlock) ||
    tx.blockNumber !== receipt.blockNumber ||
    !same(tx.blockHash, receipt.blockHash) ||
    !same(tx.from, receipt.from) ||
    !same(tx.to, APP_ENTRY_POINT) ||
    !same(receipt.to, APP_ENTRY_POINT) ||
    tx.value !== 0n ||
    !inner ||
    !same(inner.sender, wallet) ||
    !same(inner.beneficiary, tx.from) ||
    !same(inner.to, IDOLS100X_ADDRESS) ||
    inner.value !== 0n ||
    !same(inner.data, imagePaymentCalls(p)[1].data)
  )
    throw new Error("Payment does not match this photo checkout");
  // A successful outer handleOps receipt can contain a failed inner operation.
  // Require the collection's exact Paid event before issuing media access.
  const paid = receipt.logs.filter((log) => {
    if (!same(log.address, IDOLS100X_ADDRESS) || log.removed) return false;
    try {
      const event = decodeEventLog({
        abi: paidAbi,
        eventName: "Paid",
        data: log.data,
        topics: log.topics,
      });
      return (
        same(event.args.payer, wallet) &&
        event.args.tokenId === BigInt(p.tokenId) &&
        event.args.amount === BigInt(p.amount)
      );
    } catch {
      return false;
    }
  });
  if (paid.length !== 1) throw new Error("Missing exact image Paid receipt");
  await deps.available(p.imageId, p.tokenId);
  const access = await new SignJWT({ imageId: p.imageId, wallet: wallet.toLowerCase() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(issuer)
    .setAudience("media")
    .setSubject(userId)
    .setIssuedAt()
    .sign(sessionSigningKey());
  return {
    imageUrl: `/api/media/${encodeURIComponent(p.imageId)}?access=${encodeURIComponent(access)}`,
    hash,
  };
}
export async function verifyImageAccess(
  access: string | null,
  userId: string,
  wallet: string,
  imageId: string,
) {
  if (!access) return false;
  try {
    const { payload: p } = await jwtVerify(access, sessionSigningKey(), {
      algorithms: ["HS256"],
      issuer,
      audience: "media",
    });
    return (
      p.sub === userId &&
      p.wallet === wallet.toLowerCase() &&
      p.imageId === normalizeMediaId(imageId)
    );
  } catch {
    return false;
  }
}
