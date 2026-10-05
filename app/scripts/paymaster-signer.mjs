/**
 * Canonical: PAYMASTER_SIGNER. Local/cloud GROKBOT_WEB3_WALLET is the same Grokbot wallet.
 */
export function applyPaymasterSigner(env) {
  const out = { ...env };
  if (String(out.PAYMASTER_SIGNER ?? "").trim()) return out;
  const grokbot = String(out.GROKBOT_WEB3_WALLET ?? "").trim();
  if (grokbot) out.PAYMASTER_SIGNER = grokbot;
  return out;
}

export function readPaymasterSigner(env = process.env) {
  const raw = (
    env.PAYMASTER_SIGNER?.trim() ||
    env.GROKBOT_WEB3_WALLET?.trim() ||
    ""
  );
  if (!raw) throw new Error("PAYMASTER_SIGNER is not configured");
  return raw.startsWith("0x") ? raw : `0x${raw}`;
}
