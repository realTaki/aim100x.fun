import { LEGACY_IDOL_ABI } from "./legacy-idol-abi.ts";
/** Import legacy on-chain author content once, without sending transactions. */
import assert from "node:assert/strict";
import { createPublicClient, http } from "viem";
import { IDOLS100X_ADDRESS, IDOLS100X_CHAIN_ID, IDOLS100X_RPC_URL } from "../src/lib/idols100x.ts";
import { initializeIdolConfigSchema } from "../src/lib/idol-config.server.ts";
import { parseIdolConfig } from "../src/lib/idol-config.ts";
import { mediaSql } from "../src/lib/media-storage.server.ts";

async function main() {
  const apply = process.argv.includes("--apply");
  const reader = createPublicClient({ transport: http(IDOLS100X_RPC_URL) });
  const blockNumber = await reader.getBlockNumber();
  const next = Number(
    await reader.readContract({
      address: IDOLS100X_ADDRESS,
      abi: LEGACY_IDOL_ABI,
      functionName: "nextTokenId",
      blockNumber,
    }),
  );
  if (!Number.isSafeInteger(next) || next < 1 || next > 101) throw new Error("Invalid supply");
  const configs = [];
  for (let tokenId = 1; tokenId < next; tokenId++) {
    const [raw, welcome] = await Promise.all([
      reader.readContract({
        address: IDOLS100X_ADDRESS,
        abi: LEGACY_IDOL_ABI,
        functionName: "idolOf",
        args: [BigInt(tokenId)],
        blockNumber,
      }),
      reader.readContract({
        address: IDOLS100X_ADDRESS,
        abi: LEGACY_IDOL_ABI,
        functionName: "welcomeOf",
        args: [BigInt(tokenId)],
        blockNumber,
      }),
    ]);
    configs.push({
      tokenId,
      content: parseIdolConfig({ ...raw, welcome, scenes: JSON.parse(raw.scenes || "[]") }),
    });
  }
  console.log(
    JSON.stringify({
      mode: apply ? "apply" : "dry-run",
      chainId: IDOLS100X_CHAIN_ID,
      block: String(blockNumber),
      idols: configs.length,
    }),
  );
  if (!apply) return;
  await initializeIdolConfigSchema();
  const sql = mediaSql();
  let imported = 0;
  for (const { tokenId, content } of configs) {
    const inserted = await sql`INSERT INTO idol_config(chain_id,collection_address,token_id,content)
      VALUES(${IDOLS100X_CHAIN_ID},${IDOLS100X_ADDRESS.toLowerCase()},${tokenId},${JSON.stringify(content)}::jsonb)
      ON CONFLICT(chain_id,collection_address,token_id) DO NOTHING RETURNING content`;
    if (inserted.length) {
      const [row] = await sql`SELECT content FROM idol_config WHERE chain_id=${IDOLS100X_CHAIN_ID}
        AND collection_address=${IDOLS100X_ADDRESS.toLowerCase()} AND token_id=${tokenId}`;
      assert.deepEqual(parseIdolConfig(row.content), content);
      imported++;
    }
  }
  console.log(
    JSON.stringify({
      imported,
      preservedExisting: configs.length - imported,
      verifiedNew: imported,
    }),
  );
}
main().catch(() => {
  console.error("Idol configuration migration failed; no chain writes were made.");
  process.exitCode = 1;
});
