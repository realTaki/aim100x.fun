import { createHash } from "node:crypto";
import { getAddress } from "viem";
export type LoginProvider = "wallet" | "privy" | "mera";
export type LoginIdentity = { provider: LoginProvider; issuer: string; subject: string };
/** Called only after proof verification. No email matching or cross-provider linking. */
export function normalizeIdentity(input: LoginIdentity): LoginIdentity {
  if (!["wallet", "privy", "mera"].includes(input.provider)) throw new Error("Invalid provider");
  if (!input.issuer || input.issuer.length > 300 || !input.subject || input.subject.length > 300)
    throw new Error("Invalid identity");
  if (input.provider === "wallet") {
    if (input.issuer !== "eip155") throw new Error("Invalid wallet issuer");
    return { ...input, subject: getAddress(input.subject.toLowerCase()).toLowerCase() };
  }
  if (input.provider === "mera")
    return { ...input, subject: getAddress(input.subject.toLowerCase()).toLowerCase() };
  if (!input.subject.startsWith("did:privy:")) throw new Error("Invalid Privy subject");
  return input;
}
export function identityKey(input: LoginIdentity): string {
  const i = normalizeIdentity(input);
  return JSON.stringify([i.provider, i.issuer, i.subject]);
}
export function accountIdFor(input: LoginIdentity): string {
  return "aim_" + createHash("sha256").update("aim100x/account/v1\0" + identityKey(input)).digest("hex");
}
export const browserIdentity = (address: string): LoginIdentity =>
  normalizeIdentity({ provider: "wallet", issuer: "eip155", subject: address });
