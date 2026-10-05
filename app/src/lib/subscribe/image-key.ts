import { keccak256, stringToBytes } from "viem";

/** Matches Solidity `keccak256(bytes(imageId))`. */
export function imageKeyFromId(imageId: string): `0x${string}` {
  return keccak256(stringToBytes(imageId));
}
