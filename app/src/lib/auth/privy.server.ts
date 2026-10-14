import { importSPKI, jwtVerify } from "jose";
import type { LoginIdentity } from "./identity.ts";
/** Public verification key from Privy dashboard. No client-supplied DID is trusted. */
export async function verifyPrivyIdentity(token: string): Promise<LoginIdentity> {
  const appId = process.env.PRIVY_APP_ID;
  const publicKey = process.env.PRIVY_VERIFICATION_KEY;
  if (!appId || !publicKey) throw new Error("Privy authentication is not configured");
  const { payload } = await jwtVerify(token, await importSPKI(publicKey.replaceAll("\\n", "\n"), "ES256"), {
    algorithms: ["ES256"], issuer: "privy.io", audience: appId,
    requiredClaims: ["sub", "exp", "iat", "sid"], maxTokenAge: "1h",
  });
  if (!payload.sub?.startsWith("did:privy:")) throw new Error("Invalid Privy identity");
  return { provider: "privy", issuer: `privy.io/${appId}`, subject: payload.sub };
}
