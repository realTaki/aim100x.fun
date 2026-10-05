import type { Hex } from "viem";

/**
 * Pimlico on Monad 10143 bills preVerificationGas far above dummy-sig estimates.
 * Production buy 2026-09-20T08:31Z: required 2_543_751, dummy estimate+30% was 649_246.
 * Unlock/pay batches run hotter. UserOp hash includes this field — set before the passkey signs.
 */
export const USEROP_PRE_VERIFICATION_GAS_FLOOR = 4_200_000n;

export const USEROP_CALL_GAS_PER_CALL = 500_000n;
export const USEROP_VERIFICATION_GAS = 1_500_000n;
export const USEROP_VERIFICATION_GAS_DEPLOY = 2_000_000n;

/** EntryPoint v0.6: verificationGasLimit is charged 3× when a paymaster is set (validate + postOp). */
export const USEROP_PAYMASTER_VERIFICATION_MULT = 3n;

/**
 * Stay under live PasskeyPaymaster.maxCostWei (50 MON). Pimlico's simulated maxCost
 * is above gas×fee, so keep a 10 MON cushion.
 */
export const USEROP_SAFE_MAX_COST_WEI = 40_000_000_000_000_000_000n;

export function atLeastGas(current: bigint, estimated?: Hex): bigint {
  if (!estimated) return current;
  const next = (BigInt(estimated) * 13n) / 10n;
  return next > current ? next : current;
}

export function preVerificationGasLimit(estimated?: Hex, required?: bigint): bigint {
  let n = USEROP_PRE_VERIFICATION_GAS_FLOOR;
  if (estimated) n = atLeastGas(n, estimated);
  if (required) {
    const padded = (required * 13n) / 10n;
    if (padded > n) n = padded;
  }
  return n;
}

export function userOpRequiredPrefund(args: {
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
}): bigint {
  const requiredGas =
    args.callGasLimit +
    args.verificationGasLimit * USEROP_PAYMASTER_VERIFICATION_MULT +
    args.preVerificationGas;
  return requiredGas * args.maxFeePerGas;
}

/** Drop estimate bumps that would AA33 / AA31; never go below the signed floors. */
export function fitUserOpGasToMaxCost<
  T extends {
    callGasLimit: bigint;
    verificationGasLimit: bigint;
    preVerificationGas: bigint;
    maxFeePerGas: bigint;
  },
>(op: T, floors: { callGasLimit: bigint; verificationGasLimit: bigint }): T {
  if (userOpRequiredPrefund(op) <= USEROP_SAFE_MAX_COST_WEI) return op;
  op.callGasLimit = floors.callGasLimit;
  op.verificationGasLimit = floors.verificationGasLimit;
  if (userOpRequiredPrefund(op) <= USEROP_SAFE_MAX_COST_WEI) return op;
  return op;
}

/** Pimlico: "preVerificationGas is not enough, required: 2543751, got: 649246" */
export function requiredPreVerificationGas(err: unknown): bigint | undefined {
  const t =
    typeof err === "string"
      ? err
      : err instanceof Error
        ? `${err.message} ${err.cause ?? ""}`
        : err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "";
  const m = t.match(/preverificationgas is not enough[^0-9]*required:\s*(\d+)/i);
  if (!m?.[1]) return undefined;
  try {
    return BigInt(m[1]);
  } catch {
    return undefined;
  }
}