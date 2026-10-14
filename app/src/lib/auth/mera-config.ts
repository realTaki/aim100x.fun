/** Public RP configuration shared by browser and server; this is not a credential. */
export const DEFAULT_MERA_RP_ID = "aim100x.fun";
export function resolveMeraRpId(override?: string): string {
  const rpId = override?.trim() || DEFAULT_MERA_RP_ID;
  const labels = rpId.split(".");
  if (
    rpId.length > 253 ||
    labels.length < 2 ||
    labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  )
    throw new Error("Mera RP ID must be a lowercase hostname without scheme, port or path");
  return rpId;
}
export function assertMeraOrigin(origin: string, rpId: string): void {
  const url = new URL(origin);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.hostname !== rpId && !url.hostname.endsWith(`.${rpId}`))
  )
    throw new Error(
      `Mera passkeys require HTTPS on ${rpId} or its subdomains. Open the configured RP domain to sign in.`,
    );
}
export function meraOriginError(origin: string, override?: string): string | null {
  try {
    assertMeraOrigin(origin, resolveMeraRpId(override));
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Mera RP configuration is invalid";
  }
}
