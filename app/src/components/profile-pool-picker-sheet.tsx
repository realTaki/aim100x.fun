import { useEffect, useState } from "react";
import { ActionGlyphButton } from "@/components/action-glyph-button";
import { AppFrameOverlay, AppPageShell } from "@/components/app-page-shell";
import { pushActionError } from "@/lib/action-error";
import { actionErrorMessage } from "@/lib/action-glyph";
import { getBearerToken } from "@/lib/auth/client";
import { useActionGlyph } from "@/lib/use-action-glyph";
import { cn, thumbUrl } from "@/lib/utils";

type PoolItem = { pageId: string; mediaUrl: string };

/** Full-screen thumbnail album, WeChat camera-roll style. */
export function ProfilePoolPickerSheet({
  open,
  onOpenChange,
  tokenId,
  onPick,
  onPickMany,
  multiple = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokenId: number;
  onPick?: (item: PoolItem) => void | Promise<void>;
  onPickMany?: (items: PoolItem[]) => void | Promise<void>;
  multiple?: boolean;
}) {
  const [items, setItems] = useState<PoolItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const addAction = useActionGlyph();
  const resetAdd = addAction.reset;

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      resetAdd();
      return;
    }
    setLoading(true);
    const token = getBearerToken();
    void fetch(`/api/manager/profile-album/${tokenId}?kind=cover&gallery=1`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as {
          items?: PoolItem[];
          error?: string;
        };
        if (!res.ok) throw new Error(json.error || "Couldn't load");
        setItems(json.items ?? []);
      })
      .catch((err) => pushActionError(actionErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [open, tokenId, resetAdd]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirmMany() {
    const picked = items.filter((item) => selected.has(item.pageId));
    if (picked.length === 0) return;
    void addAction
      .run(async () => {
        await onPickMany?.(picked);
      })
      .then((result) => {
        if (result === "idle" || result === "done") onOpenChange(false);
      });
  }

  return (
    <AppFrameOverlay open={open} onOpenChange={onOpenChange}>
      <AppPageShell
        title={multiple && selected.size > 0 ? `Selected: ${selected.size}` : "All photos"}
        onBack={() => onOpenChange(false)}
        bodyClassName="px-0 pt-0 pb-0"
        footer={
          multiple ? (
            <div className="shrink-0 border-t border-border/70 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <ActionGlyphButton
                status={addAction.status}
                disabled={selected.size === 0}
                idleLabel={selected.size > 0 ? `Add ${selected.size}` : "Add"}
                pendingLabel="Adding…"
                onClick={confirmMany}
                className="flex h-11 w-full items-center justify-center rounded-full bg-accent text-sm font-medium text-fg disabled:opacity-45"
              >
                Add{selected.size > 0 ? ` ${selected.size}` : ""}
              </ActionGlyphButton>
            </div>
          ) : undefined
        }
      >
        {loading && items.length === 0 ? (
          <div className="grid grid-cols-4 gap-px bg-border">
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} className="aspect-square bg-surface-2" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">Library is empty</p>
        ) : (
          <div className="grid grid-cols-4 gap-px bg-border">
            {items.map((item) => {
              const picked = selected.has(item.pageId);
              return (
                <button
                  key={item.pageId}
                  type="button"
                  className="relative aspect-square overflow-hidden bg-surface-2"
                  onClick={() => {
                    if (multiple) {
                      toggle(item.pageId);
                      return;
                    }
                    onPick?.(item);
                    onOpenChange(false);
                  }}
                >
                  <img
                    src={thumbUrl(item.mediaUrl)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="size-full object-cover"
                    draggable={false}
                  />
                  {multiple ? (
                    <span
                      className={cn(
                        "absolute top-1.5 right-1.5 size-5 rounded-full border-2",
                        picked ? "border-accent bg-accent" : "border-white/80 bg-black/25",
                      )}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </AppPageShell>
    </AppFrameOverlay>
  );
}
