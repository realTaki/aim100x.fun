/** ERC-4337 v0.6 passkey smart accounts on Monad testnet 10143. */
export const ENTRY_POINT_V06 =
  "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789" as const;

/** Monad EIP-7951 P256VERIFY (RIP-7212 address / 160-byte interface). */
export const P256_VERIFIER =
  "0x0000000000000000000000000000000000000100" as const;

export const PASSKEY_ACCOUNT_FACTORY =
  "0xCEf2D86CB0e6a25490D3f69215B5b16106cA4d81" as const;

export const PASSKEY_PAYMASTER =
  "0xe443a26696d6D0D8E8dDF89AaEd21553e906BffE" as const;

export const PIMLICO_BUNDLER_URL = "https://public.pimlico.io/v2/10143/rpc";

export const PASSKEY_SESSION_ID = "passkey";

export function isPasskeySessionId(walletId: string | null | undefined): boolean {
  return walletId === PASSKEY_SESSION_ID;
}

export const P256_N =
  0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

export const PASSKEY_FACTORY_ABI = [
  {
    type: "function",
    name: "getAddress",
    stateMutability: "view",
    inputs: [
      { name: "pubkeyX", type: "uint256" },
      { name: "pubkeyY", type: "uint256" },
    ],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "createAccount",
    stateMutability: "nonpayable",
    inputs: [
      { name: "pubkeyX", type: "uint256" },
      { name: "pubkeyY", type: "uint256" },
      { name: "credentialId", type: "bytes" },
    ],
    outputs: [{ name: "account", type: "address" }],
  },
  {
    type: "function",
    name: "accountOfCredential",
    stateMutability: "view",
    inputs: [{ name: "key", type: "bytes32" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "isAccount",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "bool" }],
  },
] as const;

export const PASSKEY_ACCOUNT_ABI = [
  {
    type: "function",
    name: "execute",
    stateMutability: "nonpayable",
    inputs: [
      { name: "dest", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "executeBatch",
    stateMutability: "nonpayable",
    inputs: [
      { name: "dest", type: "address[]" },
      { name: "values", type: "uint256[]" },
      { name: "data", type: "bytes[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "pubkeyX",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "pubkeyY",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const ENTRY_POINT_ABI = [
  {
    type: "function",
    name: "getNonce",
    stateMutability: "view",
    inputs: [
      { name: "sender", type: "address" },
      { name: "key", type: "uint192" },
    ],
    outputs: [{ name: "nonce", type: "uint256" }],
  },
  {
    type: "function",
    name: "getUserOpHash",
    stateMutability: "view",
    inputs: [
      {
        name: "userOp",
        type: "tuple",
        components: [
          { name: "sender", type: "address" },
          { name: "nonce", type: "uint256" },
          { name: "initCode", type: "bytes" },
          { name: "callData", type: "bytes" },
          { name: "callGasLimit", type: "uint256" },
          { name: "verificationGasLimit", type: "uint256" },
          { name: "preVerificationGas", type: "uint256" },
          { name: "maxFeePerGas", type: "uint256" },
          { name: "maxPriorityFeePerGas", type: "uint256" },
          { name: "paymasterAndData", type: "bytes" },
          { name: "signature", type: "bytes" },
        ],
      },
    ],
    outputs: [{ type: "bytes32" }],
  },
] as const;

export const WEBAUTHN_AUTH_ABI = [
  {
    type: "tuple",
    components: [
      { name: "authenticatorData", type: "bytes" },
      { name: "clientDataJSON", type: "string" },
      { name: "challengeIndex", type: "uint256" },
      { name: "typeIndex", type: "uint256" },
      { name: "r", type: "uint256" },
      { name: "s", type: "uint256" },
    ],
  },
] as const;
