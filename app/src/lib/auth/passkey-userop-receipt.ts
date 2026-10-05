export type UserOpReceiptLike = {
  success?: boolean;
  reason?: string | null;
  revertReason?: string | null;
  receipt?: { transactionHash?: string | null } | null;
} | null;

function receiptRevertReason(mined: NonNullable<UserOpReceiptLike>): string | undefined {
  for (const value of [mined.reason, mined.revertReason]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function isTxHash(hash: string | null | undefined): hash is `0x${string}` {
  return typeof hash === "string" && /^0x[a-fA-F0-9]{64}$/.test(hash);
}

/** Bundler `eth_getUserOperationReceipt` → pending, reverted, or included tx hash. */
export function userOpReceiptResult(
  mined: UserOpReceiptLike,
):
  | { status: "pending" }
  | { status: "reverted"; reason?: string }
  | { status: "included"; hash: `0x${string}` } {
  if (mined == null) return { status: "pending" };
  const hash = mined.receipt?.transactionHash;
  const reason = receiptRevertReason(mined);
  if (mined.success === false) {
    return reason ? { status: "reverted", reason } : { status: "reverted" };
  }
  if (mined.success === true && isTxHash(hash)) {
    return { status: "included", hash };
  }
  // Bundlers may return an empty object / missing hash while the op is still in flight.
  if (mined.success === true && typeof hash === "string" && hash.startsWith("0x")) {
    return { status: "reverted" };
  }
  return { status: "pending" };
}
