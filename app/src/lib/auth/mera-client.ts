import { createPasskeyWithPrfOutput, getPasskeyPrfOutput, createSecp256k1SigningSession } from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { finishLogin, walletRequest } from "./client";
import { meraLoginKey } from "./mera-key.ts";
const encoder = new TextEncoder();
export async function signInWithMera(create: boolean, callbackURL = "/") {
  const rpId = import.meta.env.VITE_MERA_RP_ID;
  if (!rpId || (location.hostname !== rpId && !location.hostname.endsWith("." + rpId))) throw new Error("Mera is not configured for this domain");
  const salt = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode("aim100x/mera/prf/v1")));
  const output = create
    ? await createPasskeyWithPrfOutput({ rp: { id: rpId, name: "aim100x.fun" }, user: { name: "aim100x", displayName: "aim100x account" }, prfSalt: salt })
    : await getPasskeyPrfOutput({ rpId, prfSalt: salt });
  let session: ReturnType<typeof createSecp256k1SigningSession> | undefined;
  let key: Uint8Array | undefined;
  try {
    key = await meraLoginKey(output.prfOutput, rpId);
    session = createSecp256k1SigningSession({ privateKey: key });
    key.fill(0);
    const identitySigner = toViemAccount(session);
    const { message } = await walletRequest<{ message: string }>("wallet/challenge", { provider: "mera", address: identitySigner.address });
    const signature = await identitySigner.signMessage({ message });
    await walletRequest("wallet/verify", { message, signature });
  } finally { session?.end(); key?.fill(0); output.prfOutput.fill(0); }
  await finishLogin(callbackURL);
}
