import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parsePasskeyRecord,
  parsePasskeyRecordFromBearer,
  parsePasskeyRecords,
  upsertPasskeyRecord,
  type PasskeyRecord,
} from "./passkey-record.ts";

const A: PasskeyRecord = {
  address: "0xa445bac003026f5adf51760ca850ad66750e90ad",
  credentialId: "cred-a",
  x: `0x${"11".repeat(32)}`,
  y: `0x${"22".repeat(32)}`,
};

const B: PasskeyRecord = {
  address: "0x02a25747fbbc7aa5dd745b79cc152845345163a8",
  credentialId: "cred-b",
  x: `0x${"33".repeat(32)}`,
  y: `0x${"44".repeat(32)}`,
};

describe("passkey records", () => {
  it("parses a stored passkey record", () => {
    assert.deepEqual(parsePasskeyRecord(A), A);
    assert.equal(parsePasskeyRecord({ ...A, credentialId: "" }), null);
    assert.equal(parsePasskeyRecord({ address: "nope" }), null);
    assert.equal(parsePasskeyRecord({ ...A, username: "Taki" })?.username, "Taki");
  });

  it("keeps more than one credential so sign-in is not stuck on the last id", () => {
    const listed = upsertPasskeyRecord(upsertPasskeyRecord([], A), B);
    assert.deepEqual(
      listed.map((row) => row.credentialId),
      ["cred-a", "cred-b"],
    );
    const again = upsertPasskeyRecord(listed, { ...A, x: `0x${"55".repeat(32)}` });
    assert.equal(again.length, 2);
    assert.equal(again.find((row) => row.credentialId === "cred-a")?.x, `0x${"55".repeat(32)}`);
    assert.equal(
      parsePasskeyRecords([A, B, { credentialId: "nope" }]).map((row) => row.credentialId).join(","),
      "cred-a,cred-b",
    );
  });

  it("restores a passkey record from a stored passkey JWT without verifying it", () => {
    const payload = Buffer.from(
      JSON.stringify({
        typ: "passkey",
        sub: A.address,
        px: A.x,
        py: A.y,
        cid: A.credentialId,
      }),
      "utf8",
    ).toString("base64url");
    const token = `eyJhbGciOiJub25lIn0.${payload}.sig`;
    assert.deepEqual(parsePasskeyRecordFromBearer(token), A);
    assert.equal(parsePasskeyRecordFromBearer("not-a-jwt"), null);
    assert.equal(
      parsePasskeyRecordFromBearer(
        `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify({ typ: "wallet", sub: A.address }), "utf8").toString("base64url")}.x`,
      ),
      null,
    );
  });
});
