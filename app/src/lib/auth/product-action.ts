export type ProductAction =
  | { kind: "faucet" | "removeAgent" }
  | { kind: "mint"; maxAmount: string }
  | { kind: "subscribe" | "buy"; tokenId: number; maxAmount: string }
  | { kind: "tip"; tokenId: number; amount: string }
  | { kind: "sale"; tokenId: number; amount: string }
  | { kind: "pricing"; tokenId: number; subscribe: string; image: string }
  | { kind: "agent"; agent: string; role: 1 | 2 }
  | { kind: "withdraw"; tokenId: number }
  | { kind: "image"; imageId: string; paymentIntent: string };
