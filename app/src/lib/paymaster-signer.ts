/**
 * Grokbot key that funds the ERC-4337 paymaster, mints, and broadcasts.
 * Canonical: `PAYMASTER_SIGNER` (`0xa445…90ad`).
 * Local / cloud agent: `GROKBOT_WEB3_WALLET` is the same wallet — do not invent another.
 */
const KEY_NAMES = ["PAYMASTER_SIGNER", "GROKBOT_WEB3_WALLET"] as const;

export function readPaymasterSigner(
  env: Record<string, string | undefined> = process.env,
): `0x${string}` {
  for (const name of KEY_NAMES) {
    const raw = env[name]?.trim();
    if (!raw) continue;
    return (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
  }
  throw new Error("PAYMASTER_SIGNER is not configured");
}
