export const PASSKEY_RECORD_KEY = "lonelyfuns.passkey";
export const PASSKEY_RECORDS_KEY = "lonelyfuns.passkeys";

export type PasskeyRecord = {
  address: `0x${string}`;
  credentialId: string;
  x: `0x${string}`;
  y: `0x${string}`;
  /** In-app username typed at passkey signup. */
  username?: string;
};

function browserLocal(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function parsePasskeyRecord(value: unknown): PasskeyRecord | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Partial<PasskeyRecord>;
  if (
    typeof parsed.address === "string" &&
    /^0x[a-fA-F0-9]{40}$/.test(parsed.address) &&
    typeof parsed.credentialId === "string" &&
    parsed.credentialId.length > 0 &&
    typeof parsed.x === "string" &&
    typeof parsed.y === "string"
  ) {
    const username =
      typeof parsed.username === "string" && parsed.username.trim()
        ? parsed.username.trim().slice(0, 32)
        : undefined;
    return {
      address: parsed.address as `0x${string}`,
      credentialId: parsed.credentialId,
      x: parsed.x as `0x${string}`,
      y: parsed.y as `0x${string}`,
      ...(username ? { username } : {}),
    };
  }
  return null;
}

function jsonFromJwtPayload(token: string): unknown {
  const segment = token.split(".")[1];
  if (!segment) return null;
  const b64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  try {
    const json = atob(padded);
    return JSON.parse(json) as unknown;
  } catch {
    return null;
  }
}

/** Unverified passkey fields from a stored bearer — enough to restore UserOps after a missed `/get-session`. */
export function parsePasskeyRecordFromBearer(token: string | null | undefined): PasskeyRecord | null {
  if (!token) return null;
  const payload = jsonFromJwtPayload(token);
  if (!payload || typeof payload !== "object") return null;
  const row = payload as {
    typ?: unknown;
    sub?: unknown;
    px?: unknown;
    py?: unknown;
    cid?: unknown;
  };
  if (row.typ !== "passkey") return null;
  return parsePasskeyRecord({
    address: typeof row.sub === "string" ? row.sub : undefined,
    credentialId: typeof row.cid === "string" ? row.cid : undefined,
    x: typeof row.px === "string" ? row.px : undefined,
    y: typeof row.py === "string" ? row.py : undefined,
  });
}

export function parsePasskeyRecords(value: unknown): PasskeyRecord[] {
  if (!Array.isArray(value)) return [];
  const out: PasskeyRecord[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const rec = parsePasskeyRecord(item);
    if (!rec || seen.has(rec.credentialId)) continue;
    seen.add(rec.credentialId);
    out.push(rec);
  }
  return out;
}

export function upsertPasskeyRecord(records: PasskeyRecord[], record: PasskeyRecord): PasskeyRecord[] {
  return [...records.filter((row) => row.credentialId !== record.credentialId), record];
}

function readJson(key: string): unknown {
  const raw = browserLocal()?.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function loadPasskeyRecords(): PasskeyRecord[] {
  const listed = parsePasskeyRecords(readJson(PASSKEY_RECORDS_KEY));
  const current = parsePasskeyRecord(readJson(PASSKEY_RECORD_KEY));
  return current ? upsertPasskeyRecord(listed, current) : listed;
}

export function loadPasskeyRecord(): PasskeyRecord | null {
  return parsePasskeyRecord(readJson(PASSKEY_RECORD_KEY)) ?? loadPasskeyRecords().at(-1) ?? null;
}

export function findPasskeyRecord(credentialId: string): PasskeyRecord | null {
  return loadPasskeyRecords().find((row) => row.credentialId === credentialId) ?? null;
}

/** The passkey on this device that owns `address` (current session first). */
export function passkeyRecordForAddress(address: string): PasskeyRecord | null {
  const want = address.trim().toLowerCase();
  if (!want) return null;
  const current = loadPasskeyRecord();
  if (current && current.address.toLowerCase() === want) return current;
  return loadPasskeyRecords().find((row) => row.address.toLowerCase() === want) ?? null;
}

export function savePasskeyRecord(record: PasskeyRecord): void {
  const local = browserLocal();
  if (!local) return;
  const prev = findPasskeyRecord(record.credentialId);
  const username = record.username?.trim() || prev?.username;
  const merged: PasskeyRecord = username ? { ...record, username } : record;
  const next = upsertPasskeyRecord(loadPasskeyRecords(), merged);
  local.setItem(PASSKEY_RECORD_KEY, JSON.stringify(merged));
  local.setItem(PASSKEY_RECORDS_KEY, JSON.stringify(next));
}

export function clearPasskeyRecord(): void {
  browserLocal()?.removeItem(PASSKEY_RECORD_KEY);
}
