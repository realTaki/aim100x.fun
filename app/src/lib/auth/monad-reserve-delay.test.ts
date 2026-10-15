import { it } from "node:test";
import assert from "node:assert/strict";
import {
  MONAD_EXECUTION_DELAY_BLOCKS,
  waitForReserveDelay,
} from "./monad-reserve-delay.ts";

it("waits until k=3 blocks after the sponsorship block before returning", async () => {
  let block = 10n,
    sleeps = 0;
  await waitForReserveDelay(
    async () => block,
    async () => {
      sleeps++;
      block += 1n;
    },
  );
  assert.equal(block, 10n + MONAD_EXECUTION_DELAY_BLOCKS);
  assert.equal(sleeps, 3);
});

it("does not sleep when the next read is already k blocks ahead", async () => {
  let calls = 0,
    sleeps = 0;
  await waitForReserveDelay(
    async () => (++calls === 1 ? 10n : 13n),
    async () => {
      sleeps++;
    },
  );
  assert.equal(sleeps, 0);
});

it("gives up if the block height never advances", async () => {
  await assert.rejects(
    waitForReserveDelay(
      async () => 1n,
      async () => {},
    ),
    /not yet spendable/,
  );
});
