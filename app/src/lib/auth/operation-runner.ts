/** Fixed labels only: never expose provider errors, signed bytes or secret-bearing URLs. */
export type OperationFailureStage =
  "session" | "simulation" | "delegation" | "gas-reservation" | "signing";
export class OperationPreparationError extends Error {
  readonly stage: OperationFailureStage;
  constructor(stage: OperationFailureStage) {
    super("Operation preparation failed");
    this.stage = stage;
  }
}
export type OperationResult = {
  status: "pending" | "confirmed" | "failed";
  hashes: `0x${string}`[];
  reason?: "verification-required";
  failureStage?: OperationFailureStage;
  receipts?: import("./stale-operation.ts").ReceiptStatus[];
};
export type OperationStore = {
  lookup(): Promise<(OperationResult & { bodyHash: string }) | null>;
  lock(): Promise<boolean>;
  begin(count: number): Promise<void>;
  hashes(hashes: `0x${string}`[]): Promise<void>;
  status(status: OperationResult["status"]): Promise<void>;
  release(): Promise<void>;
};
/** Single writer; retain submitted evidence and never restart an unresolved request. */
export async function runProductOperation<T>(
  bodyHash: string,
  plan: () => Promise<T[]>,
  store: OperationStore,
  chain: {
    sign(call: T): Promise<`0x${string}`>;
    send(hash: `0x${string}`): Promise<void>;
    confirmed(hash: `0x${string}`): Promise<boolean>;
  },
): Promise<OperationResult> {
  const existing = await store.lookup();
  if (existing) {
    if (existing.bodyHash !== bodyHash) throw new Error("Request ID belongs to another operation");
    return {
      status: existing.status,
      hashes: existing.hashes,
      ...(existing.reason ? { reason: existing.reason, receipts: existing.receipts } : {}),
    };
  }
  const calls = await plan();
  if (!calls.length || !(await store.lock()))
    throw new Error("An operation is unresolved; check transaction status first");
  const hashes: `0x${string}`[] = [];
  let recorded = false;
  try {
    await store.begin(calls.length);
    recorded = true;
    for (const call of calls) {
      hashes.push(await chain.sign(call));
      await store.hashes([...hashes]); // Must succeed before signed bytes leave the server.
      await chain.send(hashes[hashes.length - 1]);
      if (!(await chain.confirmed(hashes[hashes.length - 1])))
        throw new Error("Transaction reverted");
    }
    await store.status("confirmed");
    await store.release();
    return { status: "confirmed", hashes };
  } catch (error) {
    const failure = error instanceof OperationPreparationError ? { failureStage: error.stage } : {};
    if (!hashes.length) {
      if (recorded) await store.status("failed");
      await store.release();
      return { status: "failed", hashes, ...failure };
    }
    return { status: "pending", hashes, reason: "verification-required", ...failure };
  }
}
