import { monadTransport } from "../monad-rpc.ts";
import {
  createPublicClient,
  formatUnits,
  http,
  isAddressEqual,
  type Address,
  type Hex,
} from "viem";
import { IDOLS100X_ADDRESS, IDOLS100X_CHAIN_ID, IDOLS100X_IDOL_ABI } from "@/lib/idols100x";
import type { McpAgentSession } from "@/lib/mcp/auth.server";
import { rejectNonAppWalletWrites } from "../auth/app-wallet-only.ts";

export type IdolContent = {
  name: string;
  bio: string;
  personality: string;
  look: string;
  voice: string;
  website: string;
  twitter: string;
  scenes: string;
};

export type Idol = IdolContent & {
  tokenId: number;
  owner: Address;
  welcome: string;
  subscribePriceUsdc: string;
  imageUnlockPriceUsdc: string;
  isPublic: boolean;
  subscriberCount: string;
  receiptsUsdc: string;
  salePriceUsdc: string;
};

type RawIdol = {
  subscribePriceUsdc: bigint;
  imageUnlockPriceUsdc: bigint;
  subscriberCount: bigint;
  receiptsUsdc: bigint;
  salePriceUsdc: bigint;
};

export type ContentPatch = Partial<IdolContent> & { welcome?: string };

export function mergeContent(current: IdolContent, patch: ContentPatch): IdolContent {
  return {
    name: patch.name ?? current.name,
    bio: patch.bio ?? current.bio,
    personality: patch.personality ?? current.personality,
    look: patch.look ?? current.look,
    voice: patch.voice ?? current.voice,
    website: patch.website ?? current.website,
    twitter: patch.twitter ?? current.twitter,
    scenes: patch.scenes ?? current.scenes,
  };
}

function roleName(role: number): "None" | "Content" | "Full" {
  if (role === 2) return "Full";
  if (role === 1) return "Content";
  return "None";
}

export class LonelyFunsClient {
  readonly publicClient;
  readonly session: McpAgentSession;

  constructor(session: McpAgentSession) {
    this.session = session;
    this.publicClient = createPublicClient({
      chain: {
        id: IDOLS100X_CHAIN_ID,
        name: "Monad Testnet",
        nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
        rpcUrls: { default: { http: [session.rpcUrl] } },
      },
      transport: monadTransport(10143),
    });
  }

  async account() {
    const address = this.session.agentAccount;
    const code = await this.publicClient.getCode({ address });
    return { address, deployed: Boolean(code && code !== "0x") };
  }

  async getIdol(tokenId: number): Promise<Idol> {
    if (!isAddressEqual(this.session.idols100x, IDOLS100X_ADDRESS))
      throw new Error("Unsupported collection");
    await this.requireRole(tokenId, 1);
    const { readIdolConfig } = await import("@/lib/idol-config.server");
    const config = await readIdolConfig(tokenId);
    const id = BigInt(tokenId);
    const [owner, raw] = await Promise.all([
      this.publicClient.readContract({
        address: this.session.idols100x,
        abi: IDOLS100X_IDOL_ABI,
        functionName: "ownerOf",
        args: [id],
      }),
      this.publicClient.readContract({
        address: this.session.idols100x,
        abi: IDOLS100X_IDOL_ABI,
        functionName: "idolOf",
        args: [id],
      }),
    ]);
    const idol = raw as RawIdol;
    return {
      tokenId,
      owner,
      name: config.name,
      bio: config.bio,
      personality: config.personality,
      look: config.look,
      voice: config.voice,
      website: config.website,
      twitter: config.twitter,
      scenes: JSON.stringify(config.scenes),
      welcome: config.welcome,
      subscribePriceUsdc: formatUnits(idol.subscribePriceUsdc, 6),
      imageUnlockPriceUsdc: formatUnits(idol.imageUnlockPriceUsdc, 6),
      isPublic: config.isPublic,
      subscriberCount: idol.subscriberCount.toString(),
      receiptsUsdc: formatUnits(idol.receiptsUsdc, 6),
      salePriceUsdc: formatUnits(idol.salePriceUsdc, 6),
    };
  }

  async authorizationFor(tokenId: number) {
    const account = this.session.agentAccount;
    const owner = await this.publicClient.readContract({
      address: this.session.idols100x,
      abi: IDOLS100X_IDOL_ABI,
      functionName: "ownerOf",
      args: [BigInt(tokenId)],
    });
    if (isAddressEqual(owner, account)) {
      return {
        owner,
        agent: account,
        role: 2,
        roleName: "Full" as const,
        authorized: true,
      };
    }
    const authorization = await this.publicClient.readContract({
      address: this.session.idols100x,
      abi: IDOLS100X_IDOL_ABI,
      functionName: "agentOf",
      args: [owner],
    });
    const role = Number(authorization.role);
    return {
      owner,
      agent: authorization.agent,
      role,
      roleName: roleName(role),
      authorized: isAddressEqual(authorization.agent, account) && role > 0,
    };
  }

  async listManageableIdols(): Promise<Array<Idol & { role: string }>> {
    const nextTokenId = await this.publicClient.readContract({
      address: this.session.idols100x,
      abi: IDOLS100X_IDOL_ABI,
      functionName: "nextTokenId",
    });
    const result: Array<Idol & { role: string }> = [];
    for (let id = 1; id < Number(nextTokenId); id += 1) {
      const authorization = await this.authorizationFor(id);
      if (!authorization.authorized) continue;
      result.push({
        ...(await this.getIdol(id)),
        role: authorization.roleName,
      });
    }
    return result;
  }

  async requireRole(tokenId: number, minimum: 1 | 2) {
    const authorization = await this.authorizationFor(tokenId);
    if (!authorization.authorized || authorization.role < minimum) {
      const needed = minimum === 2 ? "Full" : "Content or Full";
      throw new Error(
        `Agent Account ${this.session.agentAccount} needs ${needed} authorization from NFT owner ${authorization.owner}`,
      );
    }
    return authorization;
  }

  async updateContent(tokenId: number, patch: ContentPatch): Promise<{ ok: true }> {
    const current = await this.getIdol(tokenId);
    if (!Object.values(patch).some((value) => value !== undefined))
      throw new Error("Provide at least one content field");
    const { parseIdolConfig } = await import("@/lib/idol-config");
    const { writeIdolConfig } = await import("@/lib/idol-config.server");
    const content = mergeContent(current, patch);
    await writeIdolConfig(
      tokenId,
      parseIdolConfig({
        ...content,
        scenes: JSON.parse(content.scenes || "[]"),
        welcome: patch.welcome ?? current.welcome,
        isPublic: current.isPublic,
      }),
    );
    return { ok: true };
  }

  async updatePricing(
    _tokenId: number,
    _prices: { subscribePriceUsdc?: string; imageUnlockPriceUsdc?: string },
  ): Promise<Hex> {
    return rejectNonAppWalletWrites();
  }

  async setPublic(tokenId: number, isPublic: boolean): Promise<{ ok: true }> {
    const current = await this.getIdol(tokenId);
    const { writeIdolConfig } = await import("@/lib/idol-config.server");
    await writeIdolConfig(tokenId, {
      ...current,
      scenes: JSON.parse(current.scenes || "[]"),
      isPublic,
    });
    return { ok: true };
  }

  async setSalePrice(_tokenId: number, _priceUsdc: string): Promise<Hex> {
    return rejectNonAppWalletWrites();
  }
}
