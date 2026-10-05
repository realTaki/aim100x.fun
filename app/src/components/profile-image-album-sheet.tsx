import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ActionGlyphButton } from "@/components/action-glyph-button";
import type { ProfileImageKind } from "@/lib/profile-album";
import {
  albumAuthHeaders,
  deleteAlbumPages,
  replaceCoverFromPool,
  uploadProfileSlot,
} from "@/lib/profile-album-client";
import { pushActionError } from "@/lib/action-error";
import { actionErrorMessage, isActionGlyphBusy } from "@/lib/action-glyph";
import { useActionGlyph } from "@/lib/use-action-glyph";
import { cn } from "@/lib/utils";
import { LightEditSheet } from "@/components/light-edit-sheet";
import { ImageCropSheet } from "@/components/image-crop-sheet";
import { ProfilePoolPickerSheet } from "@/components/profile-pool-picker-sheet";

type AlbumItem = { pageId: string; mediaUrl: string };

const LONG_PRESS_MS = 450;

export function ProfileImageAlbumSheet({
  open,
  onOpenChange,
  tokenId,
  kind,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokenId: number;
  kind: ProfileImageKind;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<AlbumItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropMode, setCropMode] = useState<"upload" | "replace" | null>(null);
  const [replacePageId, setReplacePageId] = useState<string | null>(null);
  const [galleryFor, setGalleryFor] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressRef = useRef(false);
  const deleteAction = useActionGlyph();
  const swapAction = useActionGlyph();
  const busy = isActionGlyphBusy(deleteAction.status) || isActionGlyphBusy(swapAction.status);

  const authHeaders = useCallback((): Record<string, string> => albumAuthHeaders(), []);

  const loadAlbum = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/manager/profile-album/${tokenId}?kind=${kind}`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error || "Couldn't load");
      }
      const json = (await res.json()) as { items?: AlbumItem[] };
      setItems(json.items ?? []);
    } catch (err) {
      pushActionError(actionErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [tokenId, kind, authHeaders]);

  useEffect(() => {
    if (!open) {
      setSelectMode(false);
      setSelected(new Set());
      return;
    }
    void loadAlbum();
  }, [open, loadAlbum]);

  async function postCropped(result: { full: Blob; thumb: Blob }, extra?: Record<string, string>) {
    await uploadProfileSlot(tokenId, kind, result, extra);
    await loadAlbum();
    onChanged();
  }

  function clearPressTimer() {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  }

  function onCellPointerDown(pageId: string) {
    longPressRef.current = false;
    clearPressTimer();
    pressTimerRef.current = setTimeout(() => {
      longPressRef.current = true;
      setSelectMode(true);
      setSelected((prev) => new Set(prev).add(pageId));
      pressTimerRef.current = null;
    }, LONG_PRESS_MS);
  }

  function onCellPointerUp(pageId: string) {
    const wasLong = longPressRef.current;
    clearPressTimer();
    if (selectMode) {
      if (!wasLong) {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(pageId)) next.delete(pageId);
          else next.add(pageId);
          return next;
        });
      }
      return;
    }
    if (wasLong) return;
    if (kind === "cover") {
      setGalleryFor(pageId);
      return;
    }
    setReplacePageId(pageId);
    setCropMode("replace");
    uploadRef.current?.click();
  }

  return (
    <>
      <LightEditSheet
        open={open}
        onOpenChange={onOpenChange}
        title={kind === "cover" ? "封面" : kind === "banner" ? "横幅" : "头像"}
      >
        {selectMode ? (
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectMode(false);
                setSelected(new Set());
              }}
              className="text-sm text-muted"
            >
              取消
            </button>
            <ActionGlyphButton
              status={deleteAction.status}
              disabled={selected.size === 0}
              idleLabel="删除"
              pendingLabel="删除中…"
              onClick={() =>
                void deleteAction.run(async () => {
                  await deleteAlbumPages(tokenId, [...selected], kind);
                  setSelected(new Set());
                  setSelectMode(false);
                  await loadAlbum();
                  onChanged();
                })
              }
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-red-500/40 px-3 text-sm text-red-300 disabled:opacity-50"
            >
              <Trash2 className="size-4" />
              删除
            </ActionGlyphButton>
          </div>
        ) : null}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            disabled={loading || busy}
            aria-label="上传"
            onClick={() => {
              setCropMode("upload");
              setReplacePageId(null);
              uploadRef.current?.click();
            }}
            className={cn(
              "flex aspect-square items-center justify-center rounded-xl border border-dashed border-border/90 bg-surface-2/80 text-muted transition-colors hover:border-accent/40 hover:text-fg",
              kind === "cover" && "aspect-portrait",
            )}
          >
            <Plus className="size-8" strokeWidth={1.75} />
          </button>
          {loading ? (
            <div className="col-span-2 flex aspect-[2/1] items-center justify-center text-sm text-muted">
              …
            </div>
          ) : (
            items.map((item) => {
              const picked = selected.has(item.pageId);
              return (
                <button
                  key={item.pageId}
                  type="button"
                  className={cn(
                    "relative aspect-square overflow-hidden rounded-xl bg-surface ring-1 ring-border/60",
                    kind === "cover" && "aspect-portrait",
                    picked && "ring-2 ring-accent",
                  )}
                  onPointerDown={() => onCellPointerDown(item.pageId)}
                  onPointerUp={() => onCellPointerUp(item.pageId)}
                  onPointerLeave={clearPressTimer}
                  onPointerCancel={clearPressTimer}
                >
                  <img
                    src={item.mediaUrl}
                    alt=""
                    className="size-full object-cover"
                    draggable={false}
                  />
                  {selectMode && picked ? (
                    <span className="absolute top-1.5 right-1.5 size-5 rounded-full bg-accent ring-2 ring-bg" />
                  ) : null}
                </button>
              );
            })
          )}
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
      </LightEditSheet>

      <ImageCropSheet
        open={Boolean(cropFile)}
        file={cropFile}
        kind={kind}
        onOpenChange={(next) => {
          if (!next) {
            setCropFile(null);
            setCropMode(null);
          }
        }}
        onCropped={(result) => {
          const extra =
            cropMode === "replace" && replacePageId ? { pageId: replacePageId } : undefined;
          return postCropped(result, extra);
        }}
      />

      {kind === "cover" ? (
        <ProfilePoolPickerSheet
          open={Boolean(galleryFor)}
          onOpenChange={(next) => {
            if (!next) setGalleryFor(null);
          }}
          tokenId={tokenId}
          onPick={(item) => {
            if (!galleryFor) return;
            void swapAction.run(async () => {
              await replaceCoverFromPool(tokenId, galleryFor, item.pageId);
              await loadAlbum();
              onChanged();
            });
          }}
        />
      ) : null}
    </>
  );
}
