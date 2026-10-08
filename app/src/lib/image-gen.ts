import { SCENE_IMAGE_CAP, countSceneImages, insertGeneratedImage } from "@/lib/library";
import { generatePaidImages } from "@/lib/ai-provider";
import { resolveUserAiBackend } from "./ai-user.server.ts";
import type { ImageContentRating } from "@/lib/image-content-rating";
import { pixelsForSlot } from "@/lib/image-aspect";
import { resizeJpegToPixels } from "@/lib/image-thumb.server";
import { loadIdolImageReference } from "@/lib/image-reference.server";

type ChatBit = { role: "user" | "assistant"; content: string };

/** Keep the idol's identity with a reference; use text-only when its library is empty. */
export async function expandSceneLibrary(
  input: {
    tokenId: number;
    sceneId: string;
    messages: ChatBit[];
    triggerUserId: string;
    contentRating: ImageContentRating;
    variation?: number;
    prompt?: string;
    tags?: string;
  },
  deps = {
    resolveUserAiBackend,
    loadIdolByTokenId: async (tokenId: number) =>
      (await import("@/lib/idol-catalog.server")).loadIdolByTokenId(tokenId),
    countSceneImages,
    loadIdolImageReference,
    generatePaidImages,
    resizeJpegToPixels,
    insertGeneratedImage,
  },
): Promise<number> {
  try {
    const backend = await deps.resolveUserAiBackend();
    if (!backend) return 0;
    const idol = await deps.loadIdolByTokenId(input.tokenId);
    if (!idol) return 0;
    const prompt = input.prompt?.trim();
    if (!prompt) return 0;
    if ((await deps.countSceneImages(input.tokenId, input.sceneId)) >= SCENE_IMAGE_CAP) return 0;
    const referenceImage = await deps.loadIdolImageReference(input.tokenId, input.sceneId);

    // The tool promises one new photo per job. The caller's API wallet pays via Monad x402.
    const images = await deps.generatePaidImages(backend, {
      prompt,
      contentRating: input.contentRating,
      slot: "cover",
      count: 1,
      ...(referenceImage ? { referenceImage } : {}),
    });
    const px = pixelsForSlot("cover");
    let inserted = 0;
    for (const image of images.slice(0, 1)) {
      if ((await deps.countSceneImages(input.tokenId, input.sceneId)) >= SCENE_IMAGE_CAP) break;
      if (!image.b64) continue;
      const original = Buffer.from(image.b64, "base64");
      if (original.byteLength < 80) continue;
      const jpeg = await deps.resizeJpegToPixels(original, px.width, px.height);
      const published = await deps.insertGeneratedImage({
        tokenId: idol.tokenId,
        sceneId: input.sceneId,
        prompt,
        tags: input.tags?.trim() || input.sceneId,
        contentRating: input.contentRating,
        bytes: jpeg ?? original,
        // Production may not have ffmpeg; keep the actual Grok format on fallback.
        mime: jpeg ? "image/jpeg" : image.mime || "image/png",
        meta: { from: input.triggerUserId, scene: input.sceneId },
      });
      if (published) inserted++;
    }
    return inserted;
  } catch {
    console.warn("Chat photo generation failed");
    return 0;
  }
}
