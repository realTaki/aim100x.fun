import type { Hex } from "viem";
export type TextRecord = {
  requestId: string;
  bodyHash: string;
  status: "unpaid" | "paid" | "generating" | "retryable" | "done" | "uncharged";
  paymentHash: Hex | null;
  reply: string | null;
  attempts: number;
};
export type TextStore = {
  open(requestId: string, bodyHash: string): Promise<TextRecord>;
  lock(requestId: string): Promise<boolean>;
  save(record: TextRecord): Promise<void>;
  release(requestId: string): Promise<void>;
};
export type TextResult =
  | { ok: true; reply: string; requestId: string; paymentHash: Hex }
  | { ok: false; error: string; requestId: string; charged: boolean };
/** A receipt is required before the model. Known model failures retry WITHOUT another payment. */
export async function runTestnetText(
  requestId: string,
  bodyHash: string,
  store: TextStore,
  deps: {
    configured(): Promise<void>;
    pay(requestId: string): Promise<{ status: "pending" | "confirmed" | "failed"; hashes: Hex[] }>;
    verify(hash: Hex, requestId: string): Promise<void>;
    model(): Promise<string>;
  },
): Promise<TextResult> {
  let record = await store.open(requestId, bodyHash);
  if (record.bodyHash !== bodyHash) throw new Error("Message ID belongs to different content");
  const error = (message: string): TextResult => ({
    ok: false,
    error: message,
    requestId: record.requestId,
    charged: !!record.paymentHash,
  });
  if (record.status === "done")
    return {
      ok: true,
      reply: record.reply!,
      requestId: record.requestId,
      paymentHash: record.paymentHash!,
    };
  if (!(await store.lock(record.requestId)))
    return error("Message pending. Retry the same message; do not start another payment.");
  try {
    // Re-read after lock: another worker may have completed between open and lock.
    record = await store.open(requestId, bodyHash);
    if (record.status === "done")
      return {
        ok: true,
        reply: record.reply!,
        requestId: record.requestId,
        paymentHash: record.paymentHash!,
      };
    if (record.status === "generating")
      return error("Paid model request unresolved. Operator review required; no second payment.");
    if (record.status === "uncharged") {
      record.status = "unpaid";
      await store.save(record);
    }
    if (record.attempts >= 3)
      return error(
        "LUSD already charged; model retry limit reached. Contact support with the message ID.",
      );
    await deps.configured(); // Missing configuration must fail before any user charge.
    if (!record.paymentHash) {
      const payment = await deps.pay(record.requestId);
      if (payment.status === "failed") {
        record.status = "uncharged";
        await store.save(record);
        return error("No LUSD charged. Check the faucet and retry this same message.");
      }
      if (payment.status !== "confirmed" || payment.hashes.length !== 1)
        return error(
          "Payment pending. Retry this same message to check its receipt; do not pay again.",
        );
      await deps.verify(payment.hashes[0], record.requestId);
      record.paymentHash = payment.hashes[0];
      record.status = "paid";
      await store.save(record); // Durable receipt attribution BEFORE any model call.
    } else {
      await deps.verify(record.paymentHash, record.requestId);
    }
    record.status = "generating";
    record.attempts++;
    await store.save(record);
    let reply: string;
    try {
      reply = await deps.model();
      if (!reply.trim()) throw new Error("Empty model reply");
    } catch {
      record.status = "retryable";
      await store.save(record);
      return error(
        "LUSD already charged. Model failed; retry the SAME message at no extra LUSD charge (up to 3 attempts).",
      );
    }
    record.reply = reply;
    record.status = "done";
    await store.save(record);
    return { ok: true, reply, requestId: record.requestId, paymentHash: record.paymentHash };
  } finally {
    await store.release(record.requestId);
  }
}
