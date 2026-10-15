/** Consensus sees balances from block n-k. Currently k=3 (~1.2s). */
export const MONAD_EXECUTION_DELAY_BLOCKS = 3n;
export const RESERVE_DELAY_POLL_MS = 400;

export async function waitForReserveDelay(
  getBlockNumber: () => Promise<bigint>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
) {
  const target = (await getBlockNumber()) + MONAD_EXECUTION_DELAY_BLOCKS;
  for (let attempt = 0; attempt < 32; attempt++) {
    if ((await getBlockNumber()) >= target) return;
    await sleep(RESERVE_DELAY_POLL_MS);
  }
  throw new Error("Sponsored gas is not yet spendable; retry the same request");
}
