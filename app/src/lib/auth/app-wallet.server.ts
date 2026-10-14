import { accountIdFor, normalizeIdentity, type LoginIdentity } from "./identity.ts";
import { createHmac } from "node:crypto";
import { entropyToMnemonic } from "@scure/bip39";
import { getAddress, toHex, type Address } from "viem";
import { english, mnemonicToAccount, privateKeyToAccount } from "viem/accounts";

export function walletMasterKey(secret = process.env.WALLET_MASTER_SECRET): Buffer {
  if (!secret || !/^(?:0x)?[a-f0-9]{64}$/i.test(secret.trim()))
    throw new Error(
      "Configure and back up WALLET_MASTER_SECRET (32-byte hex) before enabling wallets",
    );
  return Buffer.from(secret.trim().replace(/^0x/i, ""), "hex");
}

/** Never use a credential, email, chain ID or session token as the derivation identity. */
export function deriveAppWallet(loginAddress: string, secret = process.env.WALLET_MASTER_SECRET) {
  const identity = getAddress(loginAddress.toLowerCase());
  const entropy = createHmac("sha256", walletMasterKey(secret))
    .update("aim100x.fun/app-wallet/v1\0")
    .update(identity.toLowerCase())
    .digest();
  const mnemonic = entropyToMnemonic(entropy, english);
  const privateKey = mnemonicToAccount(mnemonic).getHdKey().privateKey;
  if (!privateKey) throw new Error("Could not derive wallet");
  return { account: privateKeyToAccount(toHex(privateKey)), mnemonic };
}

export function sessionSigningKey() {
  return createHmac("sha256", walletMasterKey()).update("aim100x.fun/session/v1").digest();
}

/** v1 browser addresses are frozen; other namespaces use the immutable account ID. */
export function deriveIdentityWallet(input: LoginIdentity, secret = process.env.WALLET_MASTER_SECRET) {
  const identity = normalizeIdentity(input);
  if (identity.provider === "wallet") return deriveAppWallet(identity.subject, secret);
  const entropy = createHmac("sha256", walletMasterKey(secret))
    .update("aim100x.fun/app-wallet/v2\0").update(accountIdFor(identity)).digest();
  const mnemonic = entropyToMnemonic(entropy, english);
  const key = mnemonicToAccount(mnemonic).getHdKey().privateKey!;
  return { account: privateKeyToAccount(toHex(key)), mnemonic };
}
export function boundAppWallet(session: {
  identity: LoginIdentity;
  walletAddress: Address | null;
}) {
  const wallet = deriveIdentityWallet(session.identity);
  if (!session.walletAddress || wallet.account.address.toLowerCase() !== session.walletAddress.toLowerCase())
    throw new Error("Wallet derivation changed; restore the original master secret");
  return wallet;
}
