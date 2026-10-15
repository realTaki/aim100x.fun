import { createRemoteJWKSet, importSPKI, jwtVerify } from "jose";
import type { LoginIdentity } from "./identity.ts";
const remoteJwks = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
function privyVerifyKey(appId: string) {
  const pem = process.env.PRIVY_VERIFICATION_KEY;
  if (pem) return importSPKI(pem.replaceAll("\\n", "\n"), "ES256");
  const cached = remoteJwks.get(appId);
  if (cached) return cached;
  const jwks = createRemoteJWKSet(
    new URL(`https://auth.privy.io/api/v1/apps/${encodeURIComponent(appId)}/jwks.json`),
  );
  remoteJwks.set(appId, jwks);
  return jwks;
}
/** Dashboard PEM when set; otherwise Privy app JWKS. No client-supplied DID is trusted. */
export async function verifyPrivyIdentity(token: string): Promise<LoginIdentity> {
  const appId = process.env.PRIVY_APP_ID;
  if (!appId) throw new Error("Privy authentication is not configured");
  const { payload } = await jwtVerify(token, await privyVerifyKey(appId), {
    algorithms: ["ES256"], issuer: "privy.io", audience: appId,
    requiredClaims: ["sub", "exp", "iat", "sid"], maxTokenAge: "1h",
  });
  if (!payload.sub?.startsWith("did:privy:")) throw new Error("Invalid Privy identity");
  return { provider: "privy", issuer: `privy.io/${appId}`, subject: payload.sub };
}
