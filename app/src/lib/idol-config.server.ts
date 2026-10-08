import { mediaSql } from "./media-storage.server.ts";
import { IDOLS100X_ADDRESS, IDOLS100X_CHAIN_ID } from "./idols100x.ts";
import { emptyIdolConfig, parseIdolConfig, type IdolConfig } from "./idol-config.ts";
import type { MintedIdolOnChain } from "./idols100x-chain.server.ts";

export async function initializeIdolConfigSchema() {
  await mediaSql()`CREATE TABLE IF NOT EXISTS idol_config (
    chain_id bigint NOT NULL, collection_address text NOT NULL, token_id bigint NOT NULL CHECK(token_id>0),
    content jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(chain_id,collection_address,token_id))`;
}
export async function readIdolConfig(tokenId: number): Promise<IdolConfig> {
  const [row] =
    await mediaSql()`SELECT content FROM idol_config WHERE chain_id=${IDOLS100X_CHAIN_ID}
    AND collection_address=${IDOLS100X_ADDRESS.toLowerCase()} AND token_id=${tokenId}`;
  return row ? parseIdolConfig(row.content) : emptyIdolConfig(tokenId);
}
export async function overlayIdolConfigs(
  tokens: MintedIdolOnChain[],
): Promise<MintedIdolOnChain[]> {
  const rows =
    await mediaSql()`SELECT token_id,content FROM idol_config WHERE chain_id=${IDOLS100X_CHAIN_ID}
    AND collection_address=${IDOLS100X_ADDRESS.toLowerCase()}`;
  const configs = new Map(rows.map((row) => [Number(row.token_id), parseIdolConfig(row.content)]));
  return tokens.map((token) => ({
    ...token,
    ...(configs.get(token.tokenId) ?? emptyIdolConfig(token.tokenId)),
  }));
}
/** Callers must verify current on-chain ownership or agent authorization first. */
export async function writeIdolConfig(tokenId: number, input: IdolConfig) {
  const content = parseIdolConfig(input);
  await mediaSql()`INSERT INTO idol_config(chain_id,collection_address,token_id,content)
    VALUES(${IDOLS100X_CHAIN_ID},${IDOLS100X_ADDRESS.toLowerCase()},${tokenId},${JSON.stringify(content)}::jsonb)
    ON CONFLICT(chain_id,collection_address,token_id) DO UPDATE SET content=excluded.content,updated_at=now()`;
  const { loadIdolCatalog } = await import("./idol-catalog.server.ts");
  await loadIdolCatalog(true);
}
