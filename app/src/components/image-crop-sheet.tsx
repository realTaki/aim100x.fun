import { useEffect, useState } from "react";
import { LightEditSheet } from "@/components/light-edit-sheet";
import {
  aspectForSlot,
  cropRectForAspect,
  longEdgeForSlot,
  type ImageSlotKind,
} from "@/lib/image-aspect";

export async function cropFileToSlot(
  file: File,
  kind: ImageSlotKind,
  maxEdge = longEdgeForSlot(kind),
): Promise<{ full: Blob; thumb: Blob }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const aspect = aspectForSlot(kind);
    const { sx, sy, sw, sh } = cropRectForAspect(img.width, img.height, aspect);
    const full = canvasJpeg(img, sx, sy, sw, sh, maxEdge, 0.9);
    const thumb = canvasJpeg(img, sx, sy, sw, sh, 480, 0.88);
    return { full, thumb };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read image"));
    img.src = src;
  });
}

function canvasJpeg(
  img: HTMLImageElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  maxEdge: number,
  quality: number,
): Blob {
  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't crop");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  const data = canvas.toDataURL("image/jpeg", quality);
  const bytes = atob(data.split(",")[1] ?? "");
  const buf = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
  return new Blob([buf], { type: "image/jpeg" });
}

export function ImageCropSheet({
  open,
  file,
  kind,
  onOpenChange,
  onCropped,
}: {
  open: boolean;
  file: File | null;
  kind: ImageSlotKind;
  onOpenChange: (open: boolean) => void;
  onCropped: (result: { full: Blob; thumb: Blob }) => void | Promise<void>;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setSrc(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const aspect = aspectForSlot(kind);
  const frame =
    aspect >= 1
      ? { width: "100%", aspectRatio: String(aspect) }
      : { width: "min(100%, 16rem)", aspectRatio: String(aspect) };

  return (
    <LightEditSheet
      open={open}
      onOpenChange={onOpenChange}
      title="裁剪"
      closeOnSuccess
      onSave={async () => {
        if (!file) throw new Error("Choose an image");
        const result = await cropFileToSlot(file, kind);
        await onCropped(result);
      }}
      saveDisabled={!file}
      saveLabel="使用"
    >
      <div className="mx-auto overflow-hidden rounded-xl bg-surface-2" style={frame}>
        {src ? (
          <img src={src} alt="" className="size-full object-cover" />
        ) : null}
      </div>
    </LightEditSheet>
  );
}
