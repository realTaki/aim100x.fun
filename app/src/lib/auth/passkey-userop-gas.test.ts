import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  USEROP_CALL_GAS_PER_CALL,
  USEROP_PRE_VERIFICATION_GAS_FLOOR,
  USEROP_SAFE_MAX_COST_WEI,
  USEROP_VERIFICATION_GAS,
  atLeastGas,
  fitUserOpGasToMaxCost,
  preVerificationGasLimit,
  requiredPreVerificationGas,
  userOpRequiredPrefund,
} from "./passkey-userop-gas.ts";

describe("UserOp preVerificationGas floor", () => {
  it("covers Pimlico Monad buy send (required 2543751, dummy estimate 649246)", () => {
    assert.equal(USEROP_PRE_VERIFICATION_GAS_FLOOR, 4_200_000n);
    assert.ok(preVerificationGasLimit() >= 2_543_751n);
    assert.ok(preVerificationGasLimit("0x7a120") >= 2_543_751n);
    assert.equal(preVerificationGasLimit("0x7a120"), USEROP_PRE_VERIFICATION_GAS_FLOOR);
  });

  it("still takes 1.3x when the bundler estimate is above the floor", () => {
    assert.equal(atLeastGas(4_200_000n, "0x500000"), (0x500000n * 13n) / 10n);
    assert.equal(preVerificationGasLimit("0x500000"), (0x500000n * 13n) / 10n);
  });

  it("reads Pimlico required preVerificationGas out of the bundler error", () => {
    assert.equal(
      requiredPreVerificationGas(
        new Error("preVerificationGas is not enough, required: 2543751, got: 649246"),
      ),
      2_543_751n,
    );
    assert.equal(
      preVerificationGasLimit(undefined, 2_543_751n),
      USEROP_PRE_VERIFICATION_GAS_FLOOR,
    );
    assert.ok(preVerificationGasLimit(undefined, 5_000_000n) >= (5_000_000n * 13n) / 10n);
  });
});

describe("paymaster requiredPrefund (EntryPoint v0.6 3× verification)", () => {
  const liveFastFee = 167_750_000_000n;
  const payFloors = {
    callGasLimit: USEROP_CALL_GAS_PER_CALL * 2n,
    verificationGasLimit: USEROP_VERIFICATION_GAS,
    preVerificationGas: USEROP_PRE_VERIFICATION_GAS_FLOOR,
    maxFeePerGas: liveFastFee,
  };

  it("pay/unlock batch at live fast fee needs more than the 1.14 MON deposit", () => {
    const pref = userOpRequiredPrefund(payFloors);
    assert.ok(pref > 1_142_686_002_450_242_666n);
    assert.ok(pref < 50n * 10n ** 18n);
    assert.ok(pref < USEROP_SAFE_MAX_COST_WEI);
  });

  it("drops inflated call/verification estimates that would exceed 40 MON", () => {
    const op = {
      callGasLimit: 50_000_000n,
      verificationGasLimit: 80_000_000n,
      preVerificationGas: USEROP_PRE_VERIFICATION_GAS_FLOOR,
      maxFeePerGas: liveFastFee,
    };
    assert.ok(userOpRequiredPrefund(op) > USEROP_SAFE_MAX_COST_WEI);
    fitUserOpGasToMaxCost(op, {
      callGasLimit: payFloors.callGasLimit,
      verificationGasLimit: payFloors.verificationGasLimit,
    });
    assert.equal(op.callGasLimit, payFloors.callGasLimit);
    assert.equal(op.verificationGasLimit, payFloors.verificationGasLimit);
    assert.ok(userOpRequiredPrefund(op) <= USEROP_SAFE_MAX_COST_WEI);
  });
});
