import { it } from "node:test";
import assert from "node:assert/strict";
import {
  STALE_OPERATION_MS,
  createdAtMs,
  decideStoredOperation,
  isStaleOperation,
} from "./stale-operation.ts";

const hash = ("0x" + "11".repeat(32)) as `0x${string}`;
const now = 1_700_000_060_000;

it("treats missing timestamps and epoch rows as already stale", () => {
  assert.equal(createdAtMs(undefined), 0);
  assert.equal(createdAtMs("not-a-date"), 0);
  assert.equal(isStaleOperation(undefined, now), true);
  assert.equal(isStaleOperation(new Date(now - STALE_OPERATION_MS), now), true);
  assert.equal(isStaleOperation(new Date(now - STALE_OPERATION_MS + 1), now), false);
});

it("recovers a failed empty row immediately and a dropped pending row after the TTL", () => {
  assert.equal(
    decideStoredOperation({
      status: "failed",
      bodyHash: "body",
      requestedBodyHash: "body",
      hashes: [],
      expected: 1,
      createdAt: new Date(now),
      now,
    }),
    "recover",
  );
  assert.equal(
    decideStoredOperation({
      status: "pending",
      bodyHash: "body",
      requestedBodyHash: "body",
      hashes: [hash],
      expected: 1,
      createdAt: new Date(now - 1_000),
      receipts: [null],
      now,
    }),
    "return",
  );
  assert.equal(
    decideStoredOperation({
      status: "pending",
      bodyHash: "body",
      requestedBodyHash: "body",
      hashes: [hash],
      expected: 1,
      createdAt: new Date(now - STALE_OPERATION_MS),
      receipts: [null],
      now,
    }),
    "recover",
  );
  assert.equal(
    decideStoredOperation({
      status: "pending",
      bodyHash: "body",
      requestedBodyHash: "body",
      hashes: [],
      expected: 1,
      createdAt: new Date(now - STALE_OPERATION_MS),
      now,
    }),
    "recover",
  );
});

it("finalizes mined receipts and never recovers a confirmed hash or a mismatched body", () => {
  assert.equal(
    decideStoredOperation({
      status: "pending",
      bodyHash: "body",
      requestedBodyHash: "body",
      hashes: [hash],
      expected: 1,
      createdAt: new Date(0),
      receipts: ["success"],
      now,
    }),
    "confirm",
  );
  assert.equal(
    decideStoredOperation({
      status: "pending",
      bodyHash: "body",
      requestedBodyHash: "body",
      hashes: [hash],
      expected: 1,
      createdAt: new Date(0),
      receipts: ["reverted"],
      now,
    }),
    "fail",
  );
  assert.equal(
    decideStoredOperation({
      status: "confirmed",
      bodyHash: "body",
      requestedBodyHash: "body",
      hashes: [hash],
      expected: 1,
      createdAt: new Date(0),
      now,
    }),
    "return",
  );
  assert.equal(
    decideStoredOperation({
      status: "pending",
      bodyHash: "body",
      requestedBodyHash: "other",
      hashes: [hash],
      expected: 1,
      createdAt: new Date(0),
      receipts: [null],
      now,
    }),
    "mismatch",
  );
});
