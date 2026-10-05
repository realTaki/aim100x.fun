import { loadIdolByTokenId } from "@/lib/idol-catalog.server";
import {
  SCENE_IMAGE_CAP,
  countSceneImages,
  insertGeneratedImage,
  resolveMediaSource,
} from "@/lib/library";
import {
  decodeGeneratedImages,
  imageEditRequest,
  imageGenerateRequest,
  resolveAiBackend,
  type AiBackend,
  type ImageGenerationRequest,
} from "@/lib/ai-provider";
import type { ImageContentRating } from "@/lib/image-content-rating";
import { pixelsForSlot } from "@/lib/image-aspect";
import { resizeJpegToPixels } from "@/lib/image-thumb.server";

type ChatBit = { role: "user" | "assistant"; content: string };

function dataUriFor(buf: Buffer, mime = "image/jpeg") {
  return `data:${mime};base64,${buf.toString("base64")}`;
}

async function bytesFromMediaSrc(src: string): Promise<Buffer> {
  if (src.startsWith("/api/media/")) {
    const id = decodeURIComponent(src.slice("/api/media/".length).split("?")[0] ?? "");
    const resolved = await resolveMediaSource(id);
    if (resolved?.kind === "redirect") return downloadBuffer(resolved.url);
  }
  if (src.startsWith("http://") || src.startsWith("https://")) return downloadBuffer(src);
  throw new Error(`missing reference image: ${src}`);
}

async function referenceDataUri(src: string) {
  if (!src || src.startsWith("/idols/") || src.startsWith("/creators/")) {
    throw new Error(`missing reference image: ${src || "(empty)"}`);
  }
  return dataUriFor(await bytesFromMediaSrc(src));
}

async function downloadBuffer(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("download failed");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength < 80) throw new Error("empty image");
  return buf;
}

async function parsedImage(
  parsed: { b64?: string; url?: string } | undefined,
): Promise<{ bytes: Buffer; mime: string } | null> {
  if (parsed?.b64) return { bytes: Buffer.from(parsed.b64, "base64"), mime: "image/jpeg" };
  if (parsed?.url) return downloadImage(parsed.url);
  return null;
}

async function generateBatch(
  backend: AiBackend,
  request: ImageGenerationRequest,
  refDataUri: string,
): Promise<{ bytes: Buffer; mime: string }[]> {
  const edit = imageEditRequest(backend, request, refDataUri);
  const editRes = await fetch(edit.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${backend.apiKey}`,
    },
    body: JSON.stringify(edit.body),
  });
  if (editRes.ok) {
    const batch = decodeGeneratedImages(await editRes.json());
    const images = (await Promise.all(batch.map(parsedImage))).filter(
      (img): img is { bytes: Buffer; mime: string } => Boolean(img),
    );
    if (images.length > 0) return images;
  }

  const gen = imageGenerateRequest(backend, request);
  const genRes = await fetch(gen.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${backend.apiKey}`,
    },
    body: JSON.stringify(gen.body),
  });
  if (!genRes.ok) return [];
  const batch = decodeGeneratedImages(await genRes.json());
  const images = (await Promise.all(batch.map(parsedImage))).filter(
    (img): img is { bytes: Buffer; mime: string } => Boolean(img),
  );
  return images;
}

async function downloadImage(url: string) {
  const res = await fetch(url);
  if (!res.ok) return null;
  const mime = res.headers.get("content-type") || "image/jpeg";
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.byteLength < 80) return null;
  return { bytes, mime: mime.split(";")[0] || "image/jpeg" };
}

export async function expandSceneLibrary(input: {
  tokenId: number;
  sceneId: string;
  messages: ChatBit[];
  triggerUserId: string;
  contentRating: ImageContentRating;
  variation?: number;
  prompt?: string;
  tags?: string;
}) {
  const backend = resolveAiBackend();
  if (!backend) return;
  const idol = await loadIdolByTokenId(input.tokenId);
  if (!idol) return;

  try {
    const existing = await countSceneImages(input.tokenId, input.sceneId);
    if (existing >= SCENE_IMAGE_CAP) return;

    const prompt = input.prompt?.trim();
    if (!prompt) return;
    const cand = { prompt, scene: input.sceneId, tags: input.tags?.trim() || input.sceneId };

    const refPath = idol.covers[0] || idol.photos[0] || idol.avatar;
    if (!refPath) return;
    const refDataUri = await referenceDataUri(refPath).catch(() =>
      idol.avatar && idol.avatar !== refPath
        ? referenceDataUri(idol.avatar)
        : Promise.reject(new Error("missing reference image")),
    );

    const still = await countSceneImages(input.tokenId, input.sceneId);
    if (still >= SCENE_IMAGE_CAP) return;
    const remaining = SCENE_IMAGE_CAP - still;
    const images = await generateBatch(
      backend,
      {
        prompt: cand.prompt,
        contentRating: input.contentRating,
        slot: "cover",
        count: Math.min(2, remaining),
      },
      refDataUri,
    );
    const px = pixelsForSlot("cover");
    for (const img of images) {
      const cap = await countSceneImages(input.tokenId, input.sceneId);
      if (cap >= SCENE_IMAGE_CAP) break;
      const bytes = (await resizeJpegToPixels(img.bytes, px.width, px.height)) ?? img.bytes;
      await insertGeneratedImage({
        tokenId: idol.tokenId,
        sceneId: input.sceneId,
        prompt: cand.prompt,
        tags: cand.tags || input.sceneId,
        contentRating: input.contentRating,
        bytes,
        mime: "image/jpeg",
        meta: { from: input.triggerUserId, scene: cand.scene || input.sceneId },
      });
    }
  } catch {
    /* background job — chat must not fail */
  }
}
