export const ACCOUNT_EMAIL_DOMAIN = "account.aim100x.fun.invalid";

/** aim100x.fun production origin. */
export const LONELYFUNS_VERCEL_ORIGIN = "https://aim100x.fun";

export function normalizeHost(value: string): string {
  const withoutScheme = value.trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  const pathStart = withoutScheme.indexOf("/");
  return pathStart === -1 ? withoutScheme : withoutScheme.slice(0, pathStart);
}

/** Host[:port] from incoming headers, preferring the public forwarded host. */
export function requestHostFromHeaders(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-host");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return normalizeHost(first);
  }
  const host = headers.get("host")?.trim();
  return host ? normalizeHost(host) : null;
}

export function shortWalletAddress(address: string): string {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function accountEmailFor(address: string): string {
  return `${address.toLowerCase()}@${ACCOUNT_EMAIL_DOMAIN}`;
}

export function formatAccountLabel(input: {
  displayName?: string | null;
  primaryEmail?: string | null;
}): string {
  const name = input.displayName?.trim() || null;
  const email = input.primaryEmail?.trim() || null;
  if (name && !/^0x[a-fA-F0-9]{40}$/i.test(name)) return name;
  if (email && !email.endsWith(`@${ACCOUNT_EMAIL_DOMAIN}`)) return email;
  if (name) return shortWalletAddress(name);
  if (email?.endsWith(`@${ACCOUNT_EMAIL_DOMAIN}`)) {
    return shortWalletAddress(email.slice(0, email.indexOf("@")));
  }
  return name ?? email ?? "Account";
}
