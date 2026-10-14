import type { ReactNode } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
/** Privy authenticates only. Never create or select a Privy product wallet. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const appId = import.meta.env.VITE_PRIVY_APP_ID;
  if (!appId) return <>{children}</>;
  return <PrivyProvider appId={appId} config={{ loginMethods: ["email", "google", "apple"], embeddedWallets: { ethereum: { createOnLogin: "off" }, solana: { createOnLogin: "off" } } }}>{children}</PrivyProvider>;
}
