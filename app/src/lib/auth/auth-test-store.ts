import type { AuthStore } from "./account-store.server.ts";
import { accountIdFor, identityKey } from "./identity.ts";
/** Test-only fixture. Production never falls back to process-local state. */
export function memoryAuthStore(): AuthStore {
  const accounts = new Map<string,string>();
  const challenges = new Map<string,{ value: string; expires: number }>();
  const sessions = new Map<string,{ account: string; expires: number }>();
  return {
    async account(identity, walletAddress) {
      const id = accountIdFor(identity), value = JSON.stringify([identityKey(identity),walletAddress]);
      if (accounts.has(id) && accounts.get(id) !== value) throw new Error("Wallet derivation changed");
      accounts.set(id,value); return { id,identity,walletAddress };
    },
    async challenge(id,value,expires) { challenges.set(id,{value,expires}); },
    async consume(id,value) { const c=challenges.get(id); if (!c || c.value!==value || c.expires<=Date.now()) return false; challenges.delete(id); return true; },
    async session(id,account,expires) { sessions.set(id,{account,expires}); },
    async active(id,account) { const s=sessions.get(id); return !!s && s.account===account && s.expires>Date.now(); },
    async revoke(id) { sessions.delete(id); },
  };
}
