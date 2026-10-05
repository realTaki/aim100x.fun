/** ERC-721 `ownerOf` vs connected wallet. No UI lecture — callers hide edit controls. */
export function isIdolManagerWallet(
  managerAddress: string | null | undefined,
  walletAddress: string | null | undefined,
): boolean {
  if (!managerAddress || !walletAddress) return false;
  return managerAddress.toLowerCase() === walletAddress.toLowerCase();
}
