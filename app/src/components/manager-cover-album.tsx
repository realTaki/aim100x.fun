import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import { ActionGlyphButton } from "@/components/action-glyph-button";
import { GatedIdolImage } from "@/components/gated-idol-image";
import { ImageCropSheet } from "@/components/image-crop-sheet";
import { ProfilePoolPickerSheet } from "@/components/profile-pool-picker-sheet";
import { fetchCoverAlbum, type CoverAlbumItem } from "@/lib/cover-album";
import { isActionGlyphBusy } from "@/lib/action-glyph";
import { useActionGlyph } from "@/lib/use-action-glyph";
import { addCoversFromPool, deleteAlbumPages, uploadProfileSlot } from "@/lib/profile-album-client";
import { cn } from "@/lib/utils";

export function ManagerCoverAlbum({
  tokenId,
  refreshKey,
  onChanged,
}: {
  tokenId: number;
  refreshKey?: string | number;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<CoverAlbumItem[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const deleteAction = useActionGlyph();
  const busy = isActionGlyphBusy(deleteAction.status);

  useEffect(() => {
    let alive = true;
    void fetchCoverAlbum(tokenId).then((next) => {
      if (!alive) return;
      setItems(next);
    });
    return () => {
      alive = false;
    };
  }, [tokenId, refreshKey]);

  async function refresh() {
    const next = await fetchCoverAlbum(tokenId);
    setItems(next);
    onChanged();
  }

  function onPhotoClick(pageId: string) {
    if (!selectMode) {
      setSelectMode(true);
      setSelected(new Set([pageId]));
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  }

  return (
    <div>
      {selectMode ? (
        <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
          <button
            type="button"
            onClick={() => {
              setSelectMode(false);
              setSelected(new Set());
            }}
            className="text-sm text-muted"
          >
            Cancel
          </button>
          <ActionGlyphButton
            status={deleteAction.status}
            disabled={selected.size === 0}
            idleLabel="Delete"
            pendingLabel="Deleting…"
            onClick={() =>
              void deleteAction.run(async () => {
                await deleteAlbumPages(tokenId, [...selected], "cover");
                setSelected(new Set());
                setSelectMode(false);
                await refresh();
              })
            }
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-red-500/40 px-3 text-sm text-red-300 disabled:opacity-50"
          >
            <Trash2 className="size-4" />
            Delete
          </ActionGlyphButton>
        </div>
      ) : null}
      <div className="grid grid-cols-3 gap-1.5">
        <div
          className={cn(
            "flex aspect-portrait flex-col overflow-hidden rounded-xl border border-dashed border-border/80 bg-surface-2/60 text-muted",
            (busy || selectMode) && "pointer-events-none opacity-50",
          )}
        >
          <button
            type="button"
            disabled={busy || selectMode}
            aria-label="Upload from device"
            onClick={() => uploadRef.current?.click()}
            className="flex min-h-0 flex-1 items-center justify-center"
          >
            <Upload className="size-6" strokeWidth={1.75} />
          </button>
          <div className="mx-5 h-px shrink-0 bg-border" aria-hidden />
          <button
            type="button"
            disabled={busy || selectMode}
            aria-label="Add from library"
            onClick={() => setGalleryOpen(true)}
            className="flex min-h-0 flex-1 items-center justify-center"
          >
            <Plus className="size-6" strokeWidth={1.75} />
          </button>
        </div>
        {items.map((item) => {
          const picked = selected.has(item.pageId);
          return (
            <button
              key={item.pageId}
              type="button"
              className={cn(
                "relative aspect-portrait overflow-hidden rounded-xl bg-surface-2 ring-1 ring-border/60",
                picked && "ring-2 ring-accent",
              )}
              onClick={() => onPhotoClick(item.pageId)}
            >
              <GatedIdolImage
                src={item.fullUrl}
                thumbSrc={item.thumbUrl}
                locked={false}
                className="size-full"
              />
              {selectMode && picked ? (
                <span className="absolute top-1.5 right-1.5 size-5 rounded-full bg-accent ring-2 ring-bg" />
              ) : null}
            </button>
          );
        })}
      </div>
      <input
        ref={uploadRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          e.target.value = "";
          if (file) setCropFile(file);
        }}
      />
      <ImageCropSheet
        open={Boolean(cropFile)}
        file={cropFile}
        kind="cover"
        onOpenChange={(next) => {
          if (!next) setCropFile(null);
        }}
        onCropped={async (result) => {
          await uploadProfileSlot(tokenId, "cover", result);
          await refresh();
        }}
      />
      <ProfilePoolPickerSheet
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        tokenId={tokenId}
        multiple
        onPickMany={async (picked) => {
          await addCoversFromPool(
            tokenId,
            picked.map((p) => p.pageId),
          );
          await refresh();
        }}
      />
    </div>
  );
}
