import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Long-edge cap for same-page Thumbnail files. Sharp downscale, not blur. */
export const ALBUM_THUMB_LONG_EDGE = 480;

async function ffmpegJpeg(bytes: Buffer, vf: string): Promise<Buffer | null> {
  const dir = await mkdtemp(join(tmpdir(), "lf-thumb-"));
  const input = join(dir, "in.jpg");
  const output = join(dir, "out.jpg");
  try {
    await writeFile(input, bytes);
    const ok = await new Promise<boolean>((resolve) => {
      const child = spawn(
        "ffmpeg",
        ["-y", "-i", input, "-vf", vf, "-q:v", "2", output],
        { stdio: "ignore" },
      );
      child.on("close", (code) => resolve(code === 0));
      child.on("error", () => resolve(false));
    });
    if (!ok) return null;
    return await readFile(output);
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Lanczos scale, keep aspect. No gblur / gaussian. */
export async function downscaleJpeg(
  bytes: Buffer,
  longEdge = ALBUM_THUMB_LONG_EDGE,
): Promise<Buffer | null> {
  const vf = `scale='if(gte(iw,ih),min(${longEdge},iw),-2)':'if(gte(iw,ih),-2,min(${longEdge},ih))':flags=lanczos`;
  return ffmpegJpeg(bytes, vf);
}

export async function resizeJpegToPixels(
  bytes: Buffer,
  width: number,
  height: number,
): Promise<Buffer | null> {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  return ffmpegJpeg(
    bytes,
    `scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos,crop=${w}:${h}`,
  );
}
