import {
  concat,
  createPublicClient,
  encodeAbiParameters,
  encodeFunctionData,
  http,
  toHex,
  type Address,
  type Hex,
} from "viem";
import {
  ENTRY_POINT_ABI,
  ENTRY_POINT_V06,
  PASSKEY_ACCOUNT_ABI,
  PASSKEY_ACCOUNT_FACTORY,
  PASSKEY_FACTORY_ABI,
  PASSKEY_PAYMASTER,
  P256_N,
  WEBAUTHN_AUTH_ABI,
} from "./passkey-aa";
import {
  assertionFromGetResponse,
  b64urlToBytes,
  bytesToHex,
  hexToBytes,
} from "./passkey-webauthn";
import { IDOLS100X_CHAIN_ID, IDOLS100X_RPC_URL } from "@/lib/idols100x";
import { loadPasskeyRecord, type PasskeyRecord } from "./passkey-record";
import { userOpReceiptResult, type UserOpReceiptLike } from "./passkey-userop-receipt";
import {
  USEROP_CALL_GAS_PER_CALL,
  USEROP_VERIFICATION_GAS,
  USEROP_VERIFICATION_GAS_DEPLOY,
  atLeastGas,
  fitUserOpGasToMaxCost,
  preVerificationGasLimit,
  requiredPreVerificationGas,
} from "./passkey-userop-gas";

const monadChain = {
  id: IDOLS100X_CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [IDOLS100X_RPC_URL] } },
};

const publicClient = createPublicClient({
  chain: monadChain,
  transport: http(IDOLS100X_RPC_URL),
});

export type PasskeyCall = {
  to: Address;
  data: Hex;
  value?: bigint;
};

type UserOperation = {
  sender: Address;
  nonce: bigint;
  initCode: Hex;
  callData: Hex;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymasterAndData: Hex;
  signature: Hex;
};

function toRpc(op: UserOperation) {
  return {
    sender: op.sender,
    nonce: toHex(op.nonce),
    initCode: op.initCode,
    callData: op.callData,
    callGasLimit: toHex(op.callGasLimit),
    verificationGasLimit: toHex(op.verificationGasLimit),
    preVerificationGas: toHex(op.preVerificationGas),
    maxFeePerGas: toHex(op.maxFeePerGas),
    maxPriorityFeePerGas: toHex(op.maxPriorityFeePerGas),
    paymasterAndData: op.paymasterAndData,
    signature: op.signature,
  };
}

function bundlerErrorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim()) return error.trim();
  if (!error || typeof error !== "object") return "";
  const o = error as { message?: unknown; data?: unknown };
  const nested =
    o.data && typeof o.data === "object"
      ? bundlerErrorMessage(o.data)
      : typeof o.data === "string"
        ? o.data
        : "";
  const message = typeof o.message === "string" ? o.message : "";
  return [message, nested].filter((s) => s.trim()).join(" ").trim();
}

async function bundler(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch("/api/bundler", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await res.text();
  let body: { result?: unknown; error?: unknown };
  try {
    body = JSON.parse(text) as { result?: unknown; error?: unknown };
  } catch {
    throw new Error(text.trim().slice(0, 180) || "bundler");
  }
  if (body.error) throw new Error(bundlerErrorMessage(body.error) || "bundler");
  return body.result;
}

function lowS(s: bigint): bigint {
  const half = P256_N / 2n;
  return s > half ? P256_N - s : s;
}

function encodeWebAuthnSignature(assertion: ReturnType<typeof assertionFromGetResponse>): Hex {
  return encodeAbiParameters(WEBAUTHN_AUTH_ABI, [
    {
      authenticatorData: bytesToHex(assertion.authenticatorData),
      clientDataJSON: assertion.clientDataJSON,
      challengeIndex: BigInt(assertion.challengeIndex),
      typeIndex: BigInt(assertion.typeIndex),
      r: assertion.r,
      s: lowS(assertion.s),
    },
  ]);
}

/** ABI-decodable dummy so estimate does not AA23 on `signature: 0x`. Verify still fails. */
function dummyWebAuthnSignature(): Hex {
  return encodeAbiParameters(WEBAUTHN_AUTH_ABI, [
    {
      authenticatorData: ("0x" + "00".repeat(32) + "05" + "00000001") as Hex,
      // Size matches a real webauthn.get clientDataJSON (challenge + origin).
      clientDataJSON:
        '{"type":"webauthn.get","challenge":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","origin":"https://aim100x.fun","crossOrigin":false}',
      challengeIndex: 29n,
      typeIndex: 1n,
      r: 1n,
      s: 1n,
    },
  ]);
}

async function signUserOpHash(record: PasskeyRecord, userOpHash: Hex): Promise<Hex> {
  const challenge = hexToBytes(userOpHash);
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: challenge.buffer as ArrayBuffer,
      rpId: window.location.hostname,
      // No authenticatorAttachment — Chrome password-manager passkeys are not "platform".
      userVerification: "required",
      allowCredentials: [
        { type: "public-key", id: b64urlToBytes(record.credentialId).buffer as ArrayBuffer },
      ],
      timeout: 120_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("passkey");
  return encodeWebAuthnSignature(assertionFromGetResponse(cred));
}

export async function executePasskeyCalls(calls: PasskeyCall[]): Promise<Hex> {
  const record = loadPasskeyRecord();
  if (!record || calls.length === 0) throw new Error("passkey");

  const sender = record.address;
  const x = BigInt(record.x);
  const y = BigInt(record.y);
  const code = await publicClient.getCode({ address: sender });
  const nonce = await publicClient.readContract({
    address: ENTRY_POINT_V06,
    abi: ENTRY_POINT_ABI,
    functionName: "getNonce",
    args: [sender, 0n],
  });

  let initCode: Hex = "0x";
  if (!code || code === "0x") {
    initCode = concat([
      PASSKEY_ACCOUNT_FACTORY,
      encodeFunctionData({
        abi: PASSKEY_FACTORY_ABI,
        functionName: "createAccount",
        args: [x, y, bytesToHex(b64urlToBytes(record.credentialId))],
      }),
    ]);
  }

  const callData =
    calls.length === 1
      ? encodeFunctionData({
          abi: PASSKEY_ACCOUNT_ABI,
          functionName: "execute",
          args: [calls[0]!.to, calls[0]!.value ?? 0n, calls[0]!.data],
        })
      : encodeFunctionData({
          abi: PASSKEY_ACCOUNT_ABI,
          functionName: "executeBatch",
          args: [
            calls.map((c) => c.to),
            calls.map((c) => c.value ?? 0n),
            calls.map((c) => c.data),
          ],
        });

  const prices = (await bundler("pimlico_getUserOperationGasPrice", [])) as {
    fast?: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
    standard?: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
  };
  const fee = prices.fast ?? prices.standard;
  if (!fee) throw new Error("bundler");

  const deploying = initCode !== "0x";
  const callGasFloor = USEROP_CALL_GAS_PER_CALL * BigInt(calls.length);
  const verificationFloor = deploying ? USEROP_VERIFICATION_GAS_DEPLOY : USEROP_VERIFICATION_GAS;
  const op: UserOperation = {
    sender,
    nonce,
    initCode,
    callData,
    // Floors cover WebAuthn + first-time CREATE2 when dummy estimate fails.
    // Live paymaster maxCostWei is 50 MON (Pimlico prefunder > gas×fee).
    callGasLimit: callGasFloor,
    verificationGasLimit: verificationFloor,
    preVerificationGas: preVerificationGasLimit(),
    maxFeePerGas: BigInt(fee.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(fee.maxPriorityFeePerGas),
    paymasterAndData: PASSKEY_PAYMASTER,
    signature: dummyWebAuthnSignature(),
  };
  await applyEstimatedGas(op, { callGasLimit: callGasFloor, verificationGasLimit: verificationFloor });

  const userOpHash = await publicClient.readContract({
    address: ENTRY_POINT_V06,
    abi: ENTRY_POINT_ABI,
    functionName: "getUserOpHash",
    args: [op],
  });
  op.signature = await signUserOpHash(record, userOpHash);

  try {
    const hash = (await bundler("eth_sendUserOperation", [toRpc(op), ENTRY_POINT_V06])) as Hex;
    return waitForUserOpReceipt(hash);
  } catch (err) {
    const required = requiredPreVerificationGas(err);
    if (!required || required <= op.preVerificationGas) {
      console.error("[userop]", err);
      throw err;
    }
    op.preVerificationGas = preVerificationGasLimit(undefined, required);
    op.signature = dummyWebAuthnSignature();
    const retryHash = await publicClient.readContract({
      address: ENTRY_POINT_V06,
      abi: ENTRY_POINT_ABI,
      functionName: "getUserOpHash",
      args: [op],
    });
    op.signature = await signUserOpHash(record, retryHash);
    try {
      const hash = (await bundler("eth_sendUserOperation", [toRpc(op), ENTRY_POINT_V06])) as Hex;
      return waitForUserOpReceipt(hash);
    } catch (retryErr) {
      console.error("[userop]", retryErr);
      throw retryErr;
    }
  }
}

async function applyEstimatedGas(
  op: UserOperation,
  floors: { callGasLimit: bigint; verificationGasLimit: bigint },
): Promise<void> {
  try {
    const est = (await bundler("eth_estimateUserOperationGas", [toRpc(op), ENTRY_POINT_V06])) as {
      callGasLimit?: Hex;
      verificationGasLimit?: Hex;
      preVerificationGas?: Hex;
    };
    op.callGasLimit = atLeastGas(op.callGasLimit, est.callGasLimit);
    op.verificationGasLimit = atLeastGas(op.verificationGasLimit, est.verificationGasLimit);
    op.preVerificationGas = preVerificationGasLimit(est.preVerificationGas);
  } catch (err) {
    const required = requiredPreVerificationGas(err);
    if (required) op.preVerificationGas = preVerificationGasLimit(undefined, required);
  }
  fitUserOpGasToMaxCost(op, floors);
}

async function waitForUserOpReceipt(userOpHash: Hex): Promise<Hex> {
  const started = Date.now();
  while (Date.now() - started < 90_000) {
    const status = (await bundler("pimlico_getUserOperationStatus", [userOpHash])) as {
      status?: string;
    };
    if (status?.status === "failed" || status?.status === "rejected") {
      const mined = (await bundler("eth_getUserOperationReceipt", [userOpHash])) as UserOpReceiptLike;
      const result = userOpReceiptResult(mined);
      throw new Error(
        (result.status === "reverted" && result.reason) || status.status || "bundler",
      );
    }
    const mined = (await bundler("eth_getUserOperationReceipt", [userOpHash])) as UserOpReceiptLike;
    const result = userOpReceiptResult(mined);
    if (result.status === "reverted") throw new Error(result.reason ?? "bundler");
    if (result.status === "included") {
      const receipt = await publicClient.waitForTransactionReceipt({ hash: result.hash });
      if (receipt.status !== "success") throw new Error("bundler");
      return result.hash;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("bundler");
}
