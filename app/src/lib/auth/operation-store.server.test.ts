import { it, before, mock } from "node:test";
import assert from "node:assert/strict";
import type { Hex } from "viem";
import { operationStore } from "./operation-store.server.ts";
import { runProductOperation } from "./operation-runner.ts";
import type { ReceiptStatus } from "./stale-operation.ts";

before(() => {
  mock.method(globalThis, "fetch", async () => {
    throw new Error("Network forbidden in recovery tests");
  });
});

// Runs the real SQL decision path against an isolated in-memory DB.
function fixture() {
  type Row = {
    request_id: string;
    body_hash: string;
    status: string;
    hashes: Hex[];
    expected: number;
    created_at: Date;
  };
  const rows = new Map<string, Row>(),
    receipts = new Map<Hex, ReceiptStatus>(),
    queries: Hex[] = [],
    executed: string[] = [];
  let held: string | undefined,
    rpcError = false,
    next = 0;
  const sql = async (strings: TemplateStringsArray, ...v: unknown[]) => {
    const q = strings.join("?");
    assert.ok(!q.includes("DELETE FROM aim_wallet_requests"), "never delete evidence");
    if (q.startsWith("SELECT *")) {
      const r = rows.get(v[1] as string);
      return r ? [structuredClone(r)] : [];
    }
    if (q.startsWith("SELECT request_id"))
      return held ? [{ request_id: held, created_at: new Date(0) }] : [];
    if (q.startsWith("INSERT INTO aim_wallet_locks")) {
      if (held) return [];
      held = v[1] as string;
      return [{ account_id: "account" }];
    }
    if (q.startsWith("INSERT INTO aim_wallet_requests")) {
      const id = v[1] as string;
      if (rows.has(id)) throw new Error("duplicate request");
      rows.set(id, {
        request_id: id,
        body_hash: v[2] as string,
        status: "pending",
        hashes: [],
        expected: v[3] as number,
        created_at: new Date(0),
      });
      return [];
    }
    if (q.startsWith("UPDATE aim_wallet_requests SET hashes")) {
      rows.get(v[2] as string)!.hashes = JSON.parse(v[0] as string);
      return [];
    }
    if (q.startsWith("UPDATE aim_wallet_requests SET status")) {
      const r = rows.get(v[2] as string)!;
      if (!q.includes("AND status='pending'") || r.status === "pending") r.status = v[0] as string;
      return [];
    }
    if (q.startsWith("DELETE FROM aim_wallet_locks")) {
      if (held === v[1]) held = undefined;
      return [];
    }
    throw new Error(`Unexpected query: ${q}`);
  };
  const store = (id = "original", body = "body") =>
    operationStore(
      "account",
      id,
      body,
      async (hash) => {
        queries.push(hash);
        if (rpcError) throw new Error("RPC offline");
        return receipts.get(hash) ?? null;
      },
      {
        sql: sql as unknown as NonNullable<Parameters<typeof operationStore>[4]>["sql"],
        ensureSchema: async () => {},
      },
    );
  const calls = new Map<Hex, string>();
  const chain = {
    async sign(call: string): Promise<Hex> {
      const h = `0x${(++next).toString(16).padStart(64, "0")}` as Hex;
      calls.set(h, call);
      return h;
    },
    async send(h: Hex) {
      executed.push(calls.get(h)!);
      receipts.set(h, "success");
    },
    async confirmed(_h: Hex) {
      return true;
    },
  };
  return {
    rows,
    store,
    chain,
    receipts,
    queries,
    executed,
    held: () => held,
    rpcError: () => {
      rpcError = true;
    },
  };
}

it("partial success survives concurrent stale retries without A,A,B", async () => {
  const f = fixture(),
    sign = f.chain.sign;
  let interrupted = false;
  f.chain.sign = async (call) => {
    if (call === "B" && !interrupted) {
      interrupted = true;
      throw new Error("interrupted");
    }
    return sign(call);
  };
  assert.equal(
    (await runProductOperation("body", async () => ["A", "B"], f.store(), f.chain)).status,
    "pending",
  );
  const original = structuredClone(f.rows.get("original"));
  const retries = await Promise.all(
    Array.from({ length: 5 }, () =>
      runProductOperation(
        "body",
        async () => {
          assert.fail("must not replan");
        },
        f.store(),
        f.chain,
      ),
    ),
  );
  assert.ok(retries.every((r) => r.status === "pending" && r.reason === "verification-required"));
  assert.deepEqual(retries[0].receipts, ["success"]);
  assert.deepEqual(f.executed, ["A"]);
  assert.deepEqual(f.rows.get("original"), original);
  assert.equal(f.held(), "original");
  assert.ok(f.queries.length > 0);
  await assert.rejects(
    runProductOperation("body", async () => ["C"], f.store("other"), f.chain),
    /unresolved/,
  );
});
for (const failure of ["null", "RPC error"] as const) {
  it(`full hashes with ${failure} block resubmission and preserve evidence`, async () => {
    const f = fixture();
    f.chain.confirmed = async () => {
      throw new Error("confirmation lost after inclusion");
    };
    const sent = await runProductOperation("body", async () => ["payment"], f.store(), f.chain);
    if (failure === "null") f.receipts.clear();
    else f.rpcError();
    const retries = await Promise.all([f.store().lookup(), f.store().lookup()]);
    assert.ok(
      retries.every((r) => r?.status === "pending" && r.reason === "verification-required"),
    );
    assert.deepEqual(retries[0]?.receipts, [failure === "null" ? null : "unavailable"]);
    await runProductOperation(
      "body",
      async () => {
        assert.fail("no retry planning");
      },
      f.store(),
      f.chain,
    );
    await assert.rejects(
      runProductOperation("body", async () => ["payment"], f.store("new"), f.chain),
      /unresolved/,
    );
    assert.deepEqual(f.rows.get("original")?.hashes, sent.hashes);
    assert.deepEqual(f.executed, ["payment"]);
    assert.equal(f.held(), "original");
  });
}
it("a live writer is not displaced while waiting before the next hash", async () => {
  const f = fixture(),
    sign = f.chain.sign;
  let resume!: () => void, reached!: () => void;
  const paused = new Promise<void>((r) => {
    reached = r;
  });
  f.chain.sign = async (call) => {
    if (call === "B") {
      reached();
      await new Promise<void>((r) => {
        resume = r;
      });
    }
    return sign(call);
  };
  const active = runProductOperation("body", async () => ["A", "B"], f.store(), f.chain);
  await paused;
  assert.equal((await f.store().lookup())?.status, "pending");
  assert.equal(await f.store("competitor").lock(), false);
  resume();
  assert.equal((await active).status, "confirmed");
  assert.deepEqual(f.executed, ["A", "B"]);
});
it("complete receipts finalize once and permit only one subsequent writer", async () => {
  const f = fixture();
  f.chain.confirmed = async () => {
    throw new Error("response lost");
  };
  const sent = await runProductOperation("body", async () => ["faucet"], f.store(), f.chain);
  const results = await Promise.all([f.store().lookup(), f.store().lookup()]);
  assert.ok(results.every((r) => r?.status === "confirmed"));
  assert.equal(f.held(), undefined);
  assert.deepEqual(f.rows.get("original")?.hashes, sent.hashes);
  await runProductOperation(
    "body",
    async () => {
      assert.fail("already completed");
    },
    f.store(),
    f.chain,
  );
  assert.deepEqual(f.executed, ["faucet"]);
  const acquired = await Promise.all([f.store("next-a").lock(), f.store("next-b").lock()]);
  assert.equal(acquired.filter(Boolean).length, 1);
});
it("mixed known/unknown receipts do not settle or unlock", async () => {
  const f = fixture(),
    s = f.store();
  await s.lock();
  await s.begin(2);
  await s.hashes(["0x01", "0x02"]);
  f.receipts.set("0x01", "success");
  const r = await s.lookup();
  assert.equal(r?.status, "pending");
  assert.deepEqual(r?.receipts, ["success", null]);
  assert.equal(f.held(), "original");
});
it("certain reverted receipts settle as failed without deleting or replaying", async () => {
  const f = fixture(),
    s = f.store();
  await s.lock();
  await s.begin(1);
  await s.hashes(["0x01"]);
  f.receipts.set("0x01", "reverted");
  assert.equal((await s.lookup())?.status, "failed");
  assert.equal(f.held(), undefined);
  assert.equal(
    (
      await runProductOperation(
        "body",
        async () => {
          assert.fail("no replay");
        },
        s,
        f.chain,
      )
    ).status,
    "failed",
  );
  assert.deepEqual(f.rows.get("original")?.hashes, ["0x01"]);
});
it("empty pending and orphan locks cannot be reclaimed by age", async () => {
  const f = fixture();
  await f.store().lock();
  assert.equal(await f.store("other").lock(), false);
  await f.store().begin(1);
  assert.equal((await f.store().lookup())?.reason, "verification-required");
  assert.equal(await f.store("other").lock(), false);
  assert.ok(f.rows.has("original"));
});
it("failed-before-submission rows remain terminal; a fresh request can proceed", async () => {
  const f = fixture();
  f.chain.sign = async () => {
    throw new Error("revoked");
  };
  assert.equal(
    (await runProductOperation("body", async () => ["A"], f.store(), f.chain)).status,
    "failed",
  );
  assert.equal((await f.store().lookup())?.status, "failed");
  assert.equal(f.held(), undefined);
  assert.equal(await f.store("fresh").lock(), true);
  assert.ok(f.rows.has("original"));
});
it("body mismatch cannot finalize a pending operation or release its lock", async () => {
  const f = fixture(),
    s = f.store();
  await s.lock();
  await s.begin(1);
  await s.hashes(["0x01"]);
  f.receipts.set("0x01", "success");
  await assert.rejects(
    runProductOperation("changed", async () => ["A"], f.store("original", "changed"), f.chain),
    /another operation/,
  );
  assert.equal(f.rows.get("original")?.status, "pending");
  assert.equal(f.held(), "original");
});
