import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "@tanstack/react-router";
import { ChevronLeft, MessageSquare, Search, Trash2 } from "lucide-react";
import type { Idol } from "@/lib/idols";
import { getThreadForUser, restartChatForUser, searchThreadMessages } from "@/lib/chat-client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { cn, isUnauthorized } from "@/lib/utils";
import { isChapterMeta, collectPhotoUrls, type ChatMsg, type ChatThread } from "@/lib/thread";
import { ChatBubble } from "@/components/chat-screen";
import { IdolGatedPhoto } from "@/components/idol-gated-photo";
import { EmptyChatPhotos, EmptyState } from "@/components/empty-state";
import { PhotoLightbox } from "@/components/photo-lightbox";
import { useIdolMediaGate } from "@/lib/use-idol-media-gate";

export function HistoryScreen({ creator }: { creator: Idol }) {
  const { user, isPending } = useCurrentUserState();
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [blocked, setBlocked] = useState<"auth" | "fan" | "error" | null>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"messages" | "photos">("messages");
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [searchHits, setSearchHits] = useState<ChatMsg[] | null>(null);
  const [clearing, setClearing] = useState(false);
  const loginNext = `/chat/${creator.tokenId}/history`;
  const gate = useIdolMediaGate(creator, loginNext);

  useEffect(() => {
    if (isPending) return;
    if (!user) {
      setBlocked("auth");
      return;
    }
    let cancelled = false;
    void getThreadForUser(user, creator)
      .then((r) => {
        if (cancelled) return;
        if (!r.ok) {
          setBlocked("fan");
          return;
        }
        setThread(r.thread);
      })
      .catch((err) => {
        if (cancelled) return;
        setBlocked(isUnauthorized(err) ? "auth" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [user, isPending, creator]);

  const baseMessages = useMemo(
    () => (thread?.messages ?? []).filter((m) => !isChapterMeta(m)),
    [thread],
  );

  useEffect(() => {
    if (!user || !thread) {
      setSearchHits(null);
      return;
    }
    const q = query.trim();
    if (!q) {
      setSearchHits(null);
      return;
    }
    let cancelled = false;
    void searchThreadMessages(user, creator.tokenId, thread, q)
      .then((hits) => {
        if (cancelled) return;
        const lower = q.toLowerCase();
        const withPhotos = hits.filter(
          (m) =>
            m.content.toLowerCase().includes(lower) ||
            (m.imageUrl ? "图片 photo image".includes(lower) : false),
        );
        setSearchHits(withPhotos);
      })
      .catch(() => {
        if (!cancelled) setSearchHits([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user, thread, creator.tokenId, query]);

  const messages = searchHits ?? baseMessages;

  const photos = useMemo(() => {
    const out = thread ? collectPhotoUrls(thread) : [];
    const q = query.trim().toLowerCase();
    if (!q) return out;
    return out;
  }, [thread, query]);

  if (blocked === "auth") {
    return <Navigate to="/login" search={{ next: `/chat/${creator.tokenId}/history` }} />;
  }
  if (blocked === "fan") {
    return (
      <Navigate
        to="/idol/$tokenId"
        params={{ tokenId: String(creator.tokenId) }}
        search={{ needFan: false, becomeFan: false }}
      />
    );
  }
  if (blocked === "error") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6">
        <p className="text-sm text-muted">Couldn't load history</p>
        <Link
          to="/chat/$tokenId"
          params={{ tokenId: String(creator.tokenId) }}
          className="flex h-11 items-center rounded-full bg-accent px-5 text-sm font-medium text-fg shadow-[0_8px_24px_rgb(192_38_255_/_0.28)]"
        >
          返回聊天
        </Link>
      </div>
    );
  }
  if (isPending || !thread) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 text-sm text-muted">
        <span className="size-8 animate-spin rounded-full border-2 border-border border-t-accent" />
        Loading…
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-bg">
      <header className="flex shrink-0 items-center gap-2 border-b border-border/70 bg-header/80 px-2 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur-md">
        <Link
          to="/chat/$tokenId"
          params={{ tokenId: String(creator.tokenId) }}
          className="lf-icon-btn"
          aria-label="Back to chat"
        >
          <ChevronLeft className="size-6" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">
          聊天记录
        </h1>
      </header>

      <div className="shrink-0 px-4 pt-3">
        <div className="flex items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search history</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索聊天记录"
              className="lf-search"
            />
          </label>
          <button
            type="button"
            className="lf-icon-btn text-muted hover:text-danger"
            aria-label="清空聊天记录"
            title="清空聊天记录"
            disabled={clearing || !user}
            onClick={() => {
              if (!user || clearing) return;
              if (!window.confirm("Clear chat history? Photos in the library will stay so you can chat again.")) return;
              setClearing(true);
              void restartChatForUser(user, creator, thread)
                .then((next) => {
                  setThread(next);
                  setQuery("");
                  setSearchHits(null);
                })
                .catch((err) => {
                  if (isUnauthorized(err)) setBlocked("auth");
                })
                .finally(() => setClearing(false));
            }}
          >
            <Trash2 className="size-5" strokeWidth={1.75} />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-full bg-surface-2 p-1 ring-1 ring-border/70">
          <button
            type="button"
            onClick={() => setTab("messages")}
            className={cn(
              "h-9 rounded-full text-sm font-medium transition-colors",
              tab === "messages" ? "bg-accent text-fg shadow-[0_4px_14px_rgb(192_38_255_/_0.28)]" : "text-muted",
            )}
          >
            消息
          </button>
          <button
            type="button"
            onClick={() => setTab("photos")}
            className={cn(
              "h-9 rounded-full text-sm font-medium transition-colors",
              tab === "photos" ? "bg-accent text-fg shadow-[0_4px_14px_rgb(192_38_255_/_0.28)]" : "text-muted",
            )}
          >
            图片
          </button>
        </div>
      </div>

      {tab === "messages" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pt-5 pb-8">
          {messages.length === 0 ? (
            <EmptyState
              icon={<MessageSquare className="size-6 text-muted" />}
              title="No chat history found"
              hint="Try another search, or start a conversation first."
              className="py-16"
            />
          ) : (
            messages.map((m) => (
              <ChatBubble key={m.id} msg={m} gate={gate} onOpenImage={setLightbox} />
            ))
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pt-5 pb-8">
          {photos.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-8 py-16">
              <EmptyChatPhotos />
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {photos.map((src) => (
                <div
                  key={src}
                  className="aspect-portrait overflow-hidden rounded-xl bg-surface-2 ring-1 ring-border/60"
                >
                  <IdolGatedPhoto
                    src={src}
                    locked={gate.isLocked(src)}
                    onActivate={() => gate.unlockImage(src)}
                    onOpen={() => setLightbox(src)}
                    loading="lazy"
                    width={320}
                    height={480}
                    className="size-full"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {lightbox ? <PhotoLightbox src={lightbox} onClose={() => setLightbox(null)} /> : null}
    </div>
  );
}
