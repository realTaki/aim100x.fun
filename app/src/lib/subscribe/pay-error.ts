/** User-facing pay/subscribe/unlock errors: one short line, no chain dump. */

function errText(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) {
    const cause = err.cause != null ? errText(err.cause) : "";
    return `${err.name} ${err.message} ${cause}`.trim();
  }
  if (err && typeof err === "object") {
    const o = err as { message?: unknown; shortMessage?: unknown; details?: unknown };
    return [o.message, o.shortMessage, o.details]
      .filter((v): v is string => typeof v === "string")
      .join(" ");
  }
  return "";
}

export function shortPayError(err: unknown): string {
  const t = errText(err).toLowerCase();
  if (
    /erc20insufficientbalance|exceeds balance|transfer amount exceeds|余额不足|low balance/.test(t)
  ) {
    return "Low balance";
  }
  if (
    /aa21|aa31|aa32|paymaster deposit|didn't pay prefund|preverificationgas is not enough/.test(
      t,
    )
  ) {
    return "Low gas";
  }
  if (/user rejected|user denied|denied transaction|cancelled|canceled|abort/.test(t)) {
    return "Canceled";
  }
  const aa = t.match(/\baa(\d{2})\b/);
  if (aa) return `AA${aa[1]}`;
  if (/out of gas|gas required exceeds/.test(t)) return "Low gas";
  return "Pay failed";
}
