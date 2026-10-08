/** Device-local privacy lock. External-wallet SIWE remains the account authentication boundary. */
export const PIN_LENGTH = 6;
export function safePrivacyNext(raw: unknown): string {
  if (
    typeof raw !== "string" ||
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    raw.includes("\\") ||
    /^\/(welcome|login)(?:[/?#]|$)/.test(raw)
  )
    return "/";
  return raw;
}
const PREFIX = "aim-privacy-pin-v1:";
type PinRecord = { salt: string; hash: string; failures: number };

function readRecord(userId: string): PinRecord | null {
  const raw = localStorage.getItem(PREFIX + userId);
  if (!raw) return null;
  const value = JSON.parse(raw) as PinRecord;
  if (
    !/^[a-f0-9]{32}$/.test(value.salt) ||
    !/^[a-f0-9]{64}$/.test(value.hash) ||
    !Number.isInteger(value.failures) ||
    value.failures < 0
  )
    throw new Error("Invalid PIN record");
  return value;
}

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
async function digest(pin: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bytes = Uint8Array.from(salt.match(/../g)!, (part) => parseInt(part, 16));
  return hex(
    new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: "PBKDF2", hash: "SHA-256", salt: bytes, iterations: 100_000 },
        key,
        256,
      ),
    ),
  );
}

export function hasPrivacyPin(userId: string): boolean {
  return readRecord(userId) !== null;
}
export function privacyPinFailures(userId: string): number {
  return readRecord(userId)?.failures ?? 0;
}

export async function createPrivacyPin(userId: string, pin: string): Promise<void> {
  if (!/^\d{6}$/.test(pin) || readRecord(userId)) throw new Error("Cannot set PIN");
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  localStorage.setItem(
    PREFIX + userId,
    JSON.stringify({ salt, hash: await digest(pin, salt), failures: 0 }),
  );
}

export async function verifyPrivacyPin(
  userId: string,
  pin: string,
): Promise<"ok" | "wrong" | "sign-out"> {
  const record = readRecord(userId);
  if (!record) throw new Error("PIN not configured");
  if (record.failures >= 3) return "sign-out";
  const matches = /^\d{6}$/.test(pin) && (await digest(pin, record.salt)) === record.hash;
  record.failures = matches ? 0 : record.failures + 1;
  localStorage.setItem(PREFIX + userId, JSON.stringify(record));
  return matches ? "ok" : record.failures >= 3 ? "sign-out" : "wrong";
}

/** Reset only after a new successful external-wallet signature login, not on reload/unlock. */
export function resetPrivacyPinFailures(userId: string): void {
  const record = readRecord(userId);
  if (record) localStorage.setItem(PREFIX + userId, JSON.stringify({ ...record, failures: 0 }));
}

let unlocked = false;
const EVENT = "aim:privacy-lock";
export const isPrivacyUnlocked = () => unlocked;
export function setPrivacyUnlocked(value: boolean): void {
  unlocked = value;
  window.dispatchEvent(new Event(EVENT));
}
export function subscribePrivacyLock(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
