/** Frozen v1 context. PRF bytes stay on-device and are never used as the APP wallet key. */
export async function meraLoginKey(prf: Uint8Array<ArrayBuffer>, rpId: string) {
  if (prf.length !== 32 || !rpId) throw new Error("Invalid Mera PRF input");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", prf, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: encoder.encode("aim100x/mera/login/v1"), info: encoder.encode(rpId) }, key, 256));
}
