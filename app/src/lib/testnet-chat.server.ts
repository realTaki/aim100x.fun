import { createHash } from "node:crypto";
import { z } from "zod";
import { createPublicClient, erc20Abi } from "viem";
import { monadTransport } from "./monad-rpc.ts";
import { testnetWalletChain } from "./auth/app-wallet-chain.ts";
import { executeTestnetCalls } from "./auth/product-wallet.server.ts";
import { sponsorAccount } from "./auth/testnet-gas.server.ts";
import { boundAppWallet } from "./auth/app-wallet.server.ts";
import { authStore } from "./auth/account-store.server.ts";
import type { SessionUser } from "./auth/wallet-auth.server.ts";
import { LONELY_USD_ADDRESS } from "./idols100x.ts";
import { TEXT_CHAT_COST, textPaymentCall } from "./testnet-chat-policy.ts";
import { verifyTextPayment } from "./testnet-chat-receipt.ts";
import { runTestnetText } from "./testnet-chat-runner.ts";
import { textChatStore } from "./testnet-chat-store.server.ts";
import { minimaxText } from "./minimax-text.server.ts";
import { env } from "./env.server.ts";
export const textInputSchema = z
  .object({
    requestId: z.string().uuid(),
    tokenId: z.number().int().positive().safe(),
    content: z.string().trim().min(1).max(500),
    history: z
      .array(
        z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }).strict(),
      )
      .max(36),
  })
  .strict();
/** Caller must authenticate and authorize idol content before entering this function. */
export async function testnetTextChat(user: SessionUser, raw: unknown, systemPrompt: string) {
  const { requestId, ...body } = textInputSchema.parse(raw);
  if (!(await authStore.active(user.sessionId, user.id))) throw new Error("Sign in required");
  const wallet = boundAppWallet(user).account.address;
  const bodyHash = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  const reader = createPublicClient({
    chain: testnetWalletChain,
    transport: monadTransport(10143),
  });
  // Require configuration before creating a charged operation; key is never logged or returned.
  const key = env("MINIMAX_CN_API_KEY");
  if (!key) throw new Error("Configure MINIMAX_CN_API_KEY before using text chat");
  const recipient = sponsorAccount().address;
  if (recipient.toLowerCase() === wallet.toLowerCase()) throw new Error("Invalid chat recipient");
  return runTestnetText(requestId, bodyHash, textChatStore(user.id), {
    async configured() {
      if ((await reader.getChainId()) !== 10143) throw new Error("Wrong chat chain");
    },
    pay: (id) =>
      executeTestnetCalls(
        user,
        id,
        `text:${bodyHash}`,
        async () => {
          const balance = await reader.readContract({
            address: LONELY_USD_ADDRESS,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [wallet],
          });
          if (balance < TEXT_CHAT_COST)
            throw new Error(
              "Not enough testnet LUSD. Claim +100 LUSD on your profile, then retry this message.",
            );
          return [textPaymentCall(wallet, recipient, id, bodyHash)];
        },
        true,
      ),
    async verify(hash, id) {
      const [transaction, receipt, chainId] = await Promise.all([
        reader.getTransaction({ hash }),
        reader.getTransactionReceipt({ hash }),
        reader.getChainId(),
      ]);
      verifyTextPayment({ transaction, receipt, chainId }, hash, wallet, recipient, id, bodyHash);
    },
    model: () =>
      minimaxText(
        [
          { role: "system", content: systemPrompt },
          ...body.history,
          { role: "user", content: body.content },
        ],
        key,
      ),
  });
}
