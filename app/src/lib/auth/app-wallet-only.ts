/** Business writes require the authenticated server-derived APP wallet. */
export function rejectNonAppWalletWrites(): never {
  throw new Error(
    "Business transactions require your authenticated APP wallet; login wallets and legacy Agent Accounts cannot sign them",
  );
}
