import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "./auth/middleware";
import { parseIdolConfig } from "./idol-config";
import type { IdolConfig } from "./idol-config";
export const saveIdolConfig = createServerFn({ method: "POST" })
  .validator((input: { tokenId: number; config: IdolConfig }) => {
    if (!Number.isSafeInteger(input.tokenId) || input.tokenId < 1) throw new Error("Invalid idol");
    return { tokenId: input.tokenId, config: parseIdolConfig(input.config) };
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { requireIdolManager } = await import("./idol-manager.server");
    await requireIdolManager(data.tokenId, context.userId, context.bearerToken);
    const { writeIdolConfig } = await import("./idol-config.server");
    await writeIdolConfig(data.tokenId, data.config);
    return { ok: true as const };
  });
