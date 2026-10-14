/** WIP acceptance boundary: no environment flag can enable real mainnet spending. */
export function rejectMainnetSpending(): void {
  throw new Error("Mainnet spending and delegation are disabled in this testnet WIP");
}
