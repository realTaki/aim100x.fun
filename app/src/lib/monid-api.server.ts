import type { PrivateKeyAccount } from "viem/accounts";
import { paidFetch, MONID_RUN_URL, retrieveMonidRun } from "./x402-payment.server.ts";
import { monidRequest } from "./monad-ai.ts";

/** One paid submission, followed only by authenticated retrieval of that same run. */
export async function postMonidApi(
  owner: PrivateKeyAccount,
  url: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
  deps = { pay: paidFetch, retrieve: retrieveMonidRun },
) {
  const response = await deps.pay(owner, MONID_RUN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(monidRequest(url, body)),
    signal,
  });
  if (!response.ok) return response;
  let result = await response.json();
  const runId = result.runId;
  const pollUrl = result.pollUrl ?? result.hints?.pollUrl;
  const status = () => String(result.status ?? "").toUpperCase();
  const pending = () => ["QUEUED", "RUNNING", "PENDING", "CREATED"].includes(status());
  if ((response.status === 202 || pending()) && typeof pollUrl !== "string")
    throw new Error(
      `API run ${runId ?? "unknown"} is pending without a retrieval URL; do not resubmit payment`,
    );
  // 202 is pending even when the initial envelope does not include a status.
  let initialPending = response.status === 202;
  while (initialPending || pending()) {
    initialPending = false;
    signal.throwIfAborted();
    const polled = await deps.retrieve(owner, pollUrl, signal);
    if (!polled.ok)
      throw new Error(`API run ${runId} could not be retrieved; do not resubmit payment`);
    result = await polled.json();
    if (pending()) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(done, 1000);
        function done() {
          signal.removeEventListener("abort", abort);
          resolve();
        }
        function abort() {
          clearTimeout(timer);
          signal.removeEventListener("abort", abort);
          reject(signal.reason);
        }
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
      });
    }
  }
  if (["FAILED", "ERROR", "CANCELLED"].includes(status()))
    throw new Error(`API run ${runId} failed; do not retry payment automatically`);
  const providerStatus =
    result.providerResponse?.httpStatus ?? result.providerResponse?.status ?? 200;
  if (!Number.isInteger(providerStatus) || providerStatus < 200 || providerStatus > 599)
    throw new Error(`API run ${runId} has an invalid response status; do not resubmit payment`);
  const output = result.providerResponse?.body ?? result.output;
  if (output === undefined)
    throw new Error(`API run ${runId} has no output; do not resubmit payment`);
  const settlement = response.headers.get("PAYMENT-RESPONSE");
  return Response.json(output, {
    status: providerStatus === 204 ? 200 : providerStatus,
    ...(settlement ? { headers: { "PAYMENT-RESPONSE": settlement } } : {}),
  });
}
