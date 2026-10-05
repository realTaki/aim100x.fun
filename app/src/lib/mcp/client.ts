import {
  createPublicClient,
  encodeFunctionData,
  formatUnits,
  http,
  isAddressEqual,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import { IDOLS100X_CHAIN_ID, IDOLS100X_IDOL_ABI } from "@/lib/idols100x";
import type { McpAgentSession } from "@/lib/mcp/auth.server";
import { executeAgentCall } from "@/lib/mcp/userop";

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
  name: string;
  bio: string;
  personality: string;
  look: string;
  voice: string;
  website: string;
  twitter: string;
  scenes: string;
  subscribePriceUsdc: bigint;
  imageUnlockPriceUsdc: bigint;
  isPublic: boolean;
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
        nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
        rpcUrls: { default: { http: [session.rpcUrl] } },
      },
      transport: http(session.rpcUrl),
    });
  }

  async account() {
    const address = this.session.agentAccount;
    const code = await this.publicClient.getCode({ address });
    return { address, deployed: Boolean(code && code !== "0x") };
  }

  async getIdol(tokenId: number): Promise<Idol> {
    const id = BigInt(tokenId);
    const [owner, raw, welcome] = await Promise.all([
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
      this.publicClient.readContract({
        address: this.session.idols100x,
        abi: IDOLS100X_IDOL_ABI,
        functionName: "welcomeOf",
        args: [id],
      }),
    ]);
    const idol = raw as RawIdol;
    return {
      tokenId,
      owner,
      name: idol.name,
      bio: idol.bio,
      personality: idol.personality,
      look: idol.look,
      voice: idol.voice,
      website: idol.website,
      twitter: idol.twitter,
      scenes: idol.scenes,
      welcome,
      subscribePriceUsdc: formatUnits(idol.subscribePriceUsdc, 6),
      imageUnlockPriceUsdc: formatUnits(idol.imageUnlockPriceUsdc, 6),
      isPublic: idol.isPublic,
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

  async updateContent(tokenId: number, patch: ContentPatch): Promise<Hex> {
    await this.requireRole(tokenId, 1);
    const current = await this.getIdol(tokenId);
    const { welcome, ...contentPatch } = patch;
    const hasContent = Object.values(contentPatch).some((value) => value !== undefined);
    let hash: Hex | undefined;
    if (hasContent) {
      const input = mergeContent(current, contentPatch);
      hash = await this.write(
        encodeFunctionData({
          abi: IDOLS100X_IDOL_ABI,
          functionName: "setIdolContent",
          args: [BigInt(tokenId), input],
        }),
      );
    }
    if (welcome !== undefined) {
      hash = await this.write(
        encodeFunctionData({
          abi: IDOLS100X_IDOL_ABI,
          functionName: "setWelcome",
          args: [BigInt(tokenId), welcome],
        }),
      );
    }
    if (!hash) throw new Error("Provide at least one content field");
    return hash;
  }

  async updatePricing(
    tokenId: number,
    prices: { subscribePriceUsdc?: string; imageUnlockPriceUsdc?: string },
  ): Promise<Hex> {
    await this.requireRole(tokenId, 2);
    const current = await this.getIdol(tokenId);
    const subscribePriceUsdc = parseUnits(prices.subscribePriceUsdc ?? current.subscribePriceUsdc, 6);
    const imageUnlockPriceUsdc = parseUnits(
      prices.imageUnlockPriceUsdc ?? current.imageUnlockPriceUsdc,
      6,
    );
    if (subscribePriceUsdc <= 0n || imageUnlockPriceUsdc <= 0n) {
      throw new Error("Subscription and image unlock prices must be greater than zero");
    }
    return this.write(
      encodeFunctionData({
        abi: IDOLS100X_IDOL_ABI,
        functionName: "setIdolPricing",
        args: [BigInt(tokenId), { subscribePriceUsdc, imageUnlockPriceUsdc }],
      }),
    );
  }

  async setPublic(tokenId: number, isPublic: boolean): Promise<Hex> {
    await this.requireRole(tokenId, 1);
    return this.write(
      encodeFunctionData({
        abi: IDOLS100X_IDOL_ABI,
        functionName: "setPublic",
        args: [BigInt(tokenId), isPublic],
      }),
    );
  }

  async setSalePrice(tokenId: number, priceUsdc: string): Promise<Hex> {
    await this.requireRole(tokenId, 2);
    const price = parseUnits(priceUsdc, 6);
    if (price < 0n) throw new Error("Sale price cannot be negative");
    return this.write(
      encodeFunctionData({
        abi: IDOLS100X_IDOL_ABI,
        functionName: "setSalePrice",
        args: [BigInt(tokenId), price],
      }),
    );
  }

  private write(data: Hex): Promise<Hex> {
    return executeAgentCall(this.session, data);
  }
}
