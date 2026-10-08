import type { Address, EIP1193Provider } from "viem";
let selected: EIP1193Provider | undefined;
const discovered = new Set<EIP1193Provider>();
if (typeof window !== "undefined") {
  window.addEventListener("eip6963:announceProvider", (event) => {
    const provider = (event as CustomEvent<{ provider?: EIP1193Provider }>).detail?.provider;
    if (provider?.request) discovered.add(provider);
  });
}
export function rememberExternalProvider(provider: EIP1193Provider) {
  selected = provider;
}
export async function externalProviderFor(expected: Address): Promise<EIP1193Provider> {
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  await new Promise((resolve) => setTimeout(resolve, 100));
  const injected = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
  const candidates = [
    ...new Set([selected, ...discovered, injected].filter(Boolean)),
  ] as EIP1193Provider[];
  for (const provider of candidates) {
    try {
      const addresses = (await provider.request({ method: "eth_accounts" })) as string[];
      if (addresses[0]?.toLowerCase() === expected.toLowerCase()) return provider;
    } catch {
      /* Another installed wallet may be locked. */
    }
  }
  const fallback = selected ?? injected ?? candidates[0];
  if (!fallback) throw new Error("Connect the external wallet used to sign in");
  return fallback; // The signing client verifies the address before asking for a transaction.
}
