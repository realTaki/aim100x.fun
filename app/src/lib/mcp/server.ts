import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { McpAgentSession } from "@/lib/mcp/auth.server";
import { LonelyFunsClient } from "@/lib/mcp/client";

function response(value: unknown) {
  const structuredContent = value as Record<string, unknown>;
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent,
  };
}

export function createLonelyFunsMcpServer(session: McpAgentSession): McpServer {
  const client = new LonelyFunsClient(session);
  const server = new McpServer({ name: "lonelyfuns", version: "0.1.0" });

  function transaction(hash: `0x${string}`) {
    return response({
      transactionHash: hash,
      explorer: `${session.explorerUrl}/tx/${hash}`,
    });
  }

  server.registerTool(
    "get_agent_status",
    {
      description:
        "Show this MCP's Agent Account, deployment state, and every idol it is currently authorized to manage.",
      inputSchema: z.object({}),
    },
    async () => {
      const account = await client.account();
      const idols = await client.listManageableIdols();
      return response({
        chainId: 46630,
        idols100x: session.idols100x,
        agentAccount: account.address,
        deployed: account.deployed,
        managedIdols: idols.map(({ tokenId, owner, name, role }) => ({
          tokenId,
          owner,
          name,
          role,
        })),
      });
    },
  );

  server.registerTool(
    "list_managed_idols",
    {
      description: "List all idols whose current owner has authorized this Agent Account.",
      inputSchema: z.object({}),
    },
    async () => response({ idols: await client.listManageableIdols() }),
  );

  server.registerTool(
    "get_idol",
    {
      description:
        "Read authorized private idol configuration, on-chain prices, owner, and this Agent Account's role.",
      inputSchema: z.object({ tokenId: z.number().int().positive() }),
    },
    async ({ tokenId }) =>
      response({
        idol: await client.getIdol(tokenId),
        authorization: await client.authorizationFor(tokenId),
      }),
  );

  server.registerTool(
    "update_idol_content",
    {
      description:
        "Update selected content fields while preserving all unspecified private Neon fields. Requires Content or Full authorization.",
      inputSchema: z
        .object({
          tokenId: z.number().int().positive(),
          name: z.string().optional(),
          bio: z.string().optional(),
          personality: z.string().optional(),
          look: z.string().optional(),
          voice: z.string().optional(),
          website: z.string().optional(),
          twitter: z.string().optional(),
          welcome: z.string().optional().describe("欢迎词, separate from scene opening"),
          scenes: z.string().optional().describe("A JSON array encoded as a string"),
        })
        .refine(
          ({ tokenId: _tokenId, ...fields }) =>
            Object.values(fields).some((value) => value !== undefined),
          { message: "Provide at least one content field" },
        ),
    },
    async ({ tokenId, ...patch }) => response(await client.updateContent(tokenId, patch)),
  );

  server.registerTool(
    "update_idol_pricing",
    {
      description:
        "Update subscription and/or image unlock prices in human-readable LUSD (up to 6 decimals). Requires Full authorization.",
      inputSchema: z
        .object({
          tokenId: z.number().int().positive(),
          subscribePriceUsdc: z.string().optional().describe('Example: "1" or "1.5"'),
          imageUnlockPriceUsdc: z.string().optional().describe('Example: "1" or "1.5"'),
        })
        .refine(
          ({ subscribePriceUsdc, imageUnlockPriceUsdc }) =>
            subscribePriceUsdc !== undefined || imageUnlockPriceUsdc !== undefined,
          { message: "Provide at least one price" },
        ),
    },
    async ({ tokenId, subscribePriceUsdc, imageUnlockPriceUsdc }) =>
      transaction(
        await client.updatePricing(tokenId, {
          subscribePriceUsdc,
          imageUnlockPriceUsdc,
        }),
      ),
  );

  server.registerTool(
    "set_idol_public",
    {
      description:
        "Show or hide an idol on the public plaza. Requires Content or Full authorization.",
      inputSchema: z.object({
        tokenId: z.number().int().positive(),
        isPublic: z.boolean(),
      }),
    },
    async ({ tokenId, isPublic }) => response(await client.setPublic(tokenId, isPublic)),
  );

  server.registerTool(
    "set_idol_sale_price",
    {
      description:
        'Set an idol sale price in human-readable LUSD. Use "0" to take it off sale. Requires Full authorization.',
      inputSchema: z.object({
        tokenId: z.number().int().positive(),
        priceUsdc: z.string().describe('Example: "20"; at most 6 decimal places'),
      }),
    },
    async ({ tokenId, priceUsdc }) => transaction(await client.setSalePrice(tokenId, priceUsdc)),
  );

  return server;
}
