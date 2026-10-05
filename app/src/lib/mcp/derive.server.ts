import { createECDH } from "node:crypto";
import type { Hex } from "viem";
import { P256_N } from "@/lib/auth/passkey-aa";
import { bytesToHex } from "@/lib/auth/passkey-webauthn";

export function parseP256PrivateKey(value: string): Hex {
  const key = value.trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("invalid agent key");
  const scalar = BigInt(key);
  if (scalar === 0n || scalar >= P256_N) throw new Error("invalid agent key");
  return key as Hex;
}

export function deriveAgentPublic(privateKey: Hex): { pubkeyX: bigint; pubkeyY: bigint } {
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(Buffer.from(privateKey.slice(2), "hex"));
  const publicKey = ecdh.getPublicKey(undefined, "uncompressed");
  return {
    pubkeyX: BigInt(bytesToHex(publicKey.subarray(1, 33))),
    pubkeyY: BigInt(bytesToHex(publicKey.subarray(33, 65))),
  };
}
