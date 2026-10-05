import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEPOSIT_NETWORK_ASSET_LABEL,
  DEPOSIT_OTHER_ASSET_WARNING,
  LONELY_USD_FAUCET_CLAIM_LABEL,
  LONELY_USD_FAUCET_FAIL_MS,
  faucetRemainingSec,
  faucetStateLanded,
  formatFaucetCountdown,
  formatLonelyUsdAmount,
  readyAtFromLastClaim,
  shortFaucetError,
} from "./lonely-usd.ts";

describe("LonelyUSD faucet countdown", () => {
  it("is ready when readyAt is zero", () => {
    assert.equal(faucetRemainingSec(0n, 1_700_000_000), 0);
  });

  it("counts remaining seconds until readyAt", () => {
    assert.equal(faucetRemainingSec(1_700_000_100n, 1_700_000_000), 100);
    assert.equal(faucetRemainingSec(1_700_000_000n, 1_700_000_050), 0);
  });

  it("formats HH:MM:SS", () => {
    assert.equal(formatFaucetCountdown(0), "00:00:00");
    assert.equal(formatFaucetCountdown(86_400 - 1), "23:59:59");
    assert.equal(formatFaucetCountdown(3661), "01:01:01");
  });
});

describe("LonelyUSD /me labels", () => {
  it("puts network and LUSD on one deposit line, with the English other-asset hint", () => {
    assert.equal(DEPOSIT_NETWORK_ASSET_LABEL, "Monad Testnet - LUSD");
    assert.equal(
      DEPOSIT_OTHER_ASSET_WARNING,
      "Other assets may not work and could cause problems.",
    );
  });

  it("writes the full name with two decimals, never LUSD", () => {
    assert.equal(formatLonelyUsdAmount(12), "12.00 LonelyUSD");
    assert.equal(formatLonelyUsdAmount(0), "0.00 LonelyUSD");
    assert.equal(formatLonelyUsdAmount(100.5), "100.50 LonelyUSD");
    assert.equal(false, formatLonelyUsdAmount(1).includes("LUSD"));
  });

  it("treats a last-claim, balance, or cooldown change as landed", () => {
    assert.equal(
      faucetStateLanded(
        { balance: 0n, lastFaucetAt: 0n, readyAt: 0n },
        { balance: 100_000_000n, lastFaucetAt: 10n, readyAt: 86_410n },
      ),
      true,
    );
    assert.equal(
      faucetStateLanded(
        { balance: 0n, lastFaucetAt: 0n, readyAt: 0n },
        { balance: 0n, lastFaucetAt: 0n, readyAt: 0n },
      ),
      false,
    );
    assert.equal(
      faucetStateLanded(
        { balance: null, lastFaucetAt: 0n, readyAt: 0n },
        { balance: 0n, lastFaucetAt: 0n, readyAt: 86_400n },
      ),
      true,
    );
    assert.equal(
      faucetStateLanded(
        { balance: null, lastFaucetAt: 0n, readyAt: 0n },
        { balance: 100_000_000n, lastFaucetAt: 0n, readyAt: 0n },
      ),
      true,
    );
  });

  it("derives cooldown from on-chain last claim, not a local 24h guess", () => {
    assert.equal(readyAtFromLastClaim(0n), 0n);
    assert.equal(readyAtFromLastClaim(1_700_000_000n), 1_700_086_400n);
    assert.equal(faucetRemainingSec(readyAtFromLastClaim(1_700_000_000n), 1_700_000_000), 86_400);
    assert.equal(faucetRemainingSec(readyAtFromLastClaim(1_700_000_000n), 1_700_086_400), 0);
  });
});

describe("LonelyUSD faucet fail label", () => {
  it("keeps the claimable button copy and a 2s fail flash", () => {
    assert.equal(LONELY_USD_FAUCET_CLAIM_LABEL, "+100 LUSD");
    assert.equal(LONELY_USD_FAUCET_FAIL_MS, 2000);
  });

  it("maps paymaster gas and cooldown to short button copy", () => {
    assert.equal(shortFaucetError(new Error("AA31 paymaster deposit too low")), "Low gas");
    assert.equal(shortFaucetError("AA21 didn't pay prefund"), "Low gas");
    assert.equal(shortFaucetError(new Error("AA13 wait over verificationGasLimit")), "AA13");
    assert.equal(shortFaucetError(new Error("AA23 reverted (or OOG)")), "AA23");
    assert.equal(shortFaucetError(new Error("AA33 reverted (or OOG)")), "AA33");
    assert.equal(shortFaucetError(new Error("Invalid UserOperation signature or paymaster signature")), "Sign failed");
    assert.equal(shortFaucetError(new Error("execution reverted: Cooldown")), "Cooldown");
    assert.equal(shortFaucetError(new Error("User rejected the request")), "Canceled");
    assert.equal(shortFaucetError(new Error("bundler")), "Claim failed");
  });
});
