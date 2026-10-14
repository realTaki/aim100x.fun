import { usePrivy, useLogin } from "@privy-io/react-auth";
import { useState } from "react";
import { finishLogin, walletRequest } from "./client";
export function PrivySignIn({ callbackURL }: { callbackURL: string }) {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function exchange() {
    setBusy(true); setError("");
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error("Privy login unavailable");
      const { message } = await walletRequest<{ message: string }>("wallet/challenge", { provider: "privy" });
      await walletRequest("wallet/verify", { message, accessToken });
      await finishLogin(callbackURL);
    } catch { setError("Privy sign-in failed. Check configuration or sign in again."); setBusy(false); }
  }
  const { login } = useLogin({ onComplete: () => { void exchange(); }, onError: () => { setError("Privy sign-in failed"); setBusy(false); } });
  return <><button type="button" disabled={!ready || busy} onClick={() => { if (authenticated) void exchange(); else login(); }} className="mb-2 h-12 w-full rounded-2xl bg-accent text-fg disabled:opacity-50">{busy ? "Signing in…" : "Continue with Privy"}</button>{error && <p role="alert">{error}</p>}</>;
}
