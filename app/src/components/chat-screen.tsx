import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { Link, Navigate } from "@tanstack/react-router";
import { ChevronLeft, History, Keyboard, Mic, SendHorizontal } from "lucide-react";
import { idolName, idolVoiceId } from "@/lib/idol-fields";
import type { Idol } from "@/lib/idols";
import { IdolAvatarRing } from "@/components/idol-avatar-ring";
import { GatedIdolImage } from "@/components/gated-idol-image";
import { IdolGatedPhoto } from "@/components/idol-gated-photo";
import { PhotoLightbox } from "@/components/photo-lightbox";
import { transcribeAudio } from "@/lib/ai";
import { withSendErrorBubble } from "@/lib/chat-fallback";
import {
  attachChatImageForUser,
  attachChatVoiceForUser,
  generateNewPhotosForUser,
  getThreadForUser,
  persistChatThread,
  refreshThreadChoices,
  sendChatForUser,
} from "@/lib/chat-client";
import {
  beginChatSend,
  chatSessionKey,
  endChatSend,
  getChatSendSnapshot,
  peekLiveThread,
  publishLiveThread,
  subscribeChatSendLock,
  subscribeLiveThread,
} from "@/lib/chat-send-lock";
import {
  blobToBase64,
  pickRecorderMime,
  playAudioUrl,
  playingAudioUrl,
  subscribeAudioPlayback,
  stopAudio,
} from "@/lib/audio-client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { sanitizeIdolReply } from "@/lib/chat-reply";
import { cn, isUnauthorized, uid } from "@/lib/utils";
import {
  isChapterMeta,
  isChatError,
  keepSentThread,
  needsGeneratedShortcutChoices,
  chipTurnKey,
  preferLiveThread,
  rememberUsedImageId,
  threadChoices,
  withOptimisticUserMessage,
  type ChatMsg,
  type ChatThread,
} from "@/lib/thread";
import { useIdolMediaGate, type IdolMediaGate } from "@/lib/use-idol-media-gate";

export function ChatScreen({ creator }: { creator: Idol }) {
  const { user, isPending } = useCurrentUserState();
  const tokenId = creator.tokenId;
  const sessionKey = user ? chatSessionKey(user.id, tokenId) : "";

  const inFlightText = useSyncExternalStore(
    subscribeChatSendLock,
    () => (sessionKey ? getChatSendSnapshot(sessionKey) : ""),
    () => "",
  );
  const sendBusy = inFlightText.length > 0;

  const [thread, setThread] = useState<ChatThread | null>(() =>
    sessionKey ? (peekLiveThread(sessionKey) ?? null) : null,
  );
  const [blocked, setBlocked] = useState<"auth" | "fan" | "error" | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  const [draft, setDraft] = useState("");
  const [inputMode, setInputMode] = useState<"voice" | "text">("voice");
  const [transcribing, setTranscribing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const loginNext = `/chat/${tokenId}`;
  const gate = useIdolMediaGate(creator, loginNext, { chatPerImagePaywall: true });
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const holdActiveRef = useRef(false);
  const creatorRef = useRef(creator);
  creatorRef.current = creator;
  const busy = sendBusy || transcribing;

  useEffect(() => {
    if (!sessionKey) return;
    const cached = peekLiveThread(sessionKey);
    if (cached) setThread((prev) => preferLiveThread(prev, cached));
    return subscribeLiveThread(sessionKey, (incoming) => {
      setThread((prev) => preferLiveThread(prev, incoming));
    });
  }, [sessionKey]);

  useEffect(() => {
    if (isPending) return;
    if (!user) {
      setBlocked("auth");
      return;
    }
    const key = chatSessionKey(user.id, tokenId);
    if (getChatSendSnapshot(key)) return;
    let cancelled = false;
    void getThreadForUser(user, creatorRef.current)
      .then((r) => {
        if (cancelled) return;
        if (getChatSendSnapshot(key)) return;
        if (!r.ok) {
          setBlocked("fan");
          return;
        }
        setThread((prev) => {
          const next = preferLiveThread(prev, r.thread);
          publishLiveThread(key, next);
          return next;
        });
      })
      .catch((err) => {
        if (cancelled) return;
        if (getChatSendSnapshot(key)) return;
        if (isUnauthorized(err)) {
          setBlocked("auth");
          return;
        }
        setThread((prev) => {
          if (!prev) {
            setBlocked("error");
            return prev;
          }
          const next = withSendErrorBubble(prev, "Couldn't load history");
          publishLiveThread(key, next);
          return next;
        });
      });
    return () => {
      cancelled = true;
    };
  }, [user, isPending, tokenId, loadKey]);

  const chapter = thread?.chapter ?? 0;
  const messages = (thread?.messages ?? []).filter((m) => !isChapterMeta(m));
  const storedChoices = thread ? threadChoices(thread, chapter) : [];
  const showChoices =
    Boolean(thread) &&
    storedChoices.length > 0 &&
    !needsGeneratedShortcutChoices(creator, chapter, storedChoices);
  const choices = showChoices && !recording ? storedChoices : [];
  const chipGenKey = thread ? chipTurnKey(thread) : "";
  const chipGenRef = useRef("");

  useEffect(() => {
    if (!user || !sessionKey || !thread || busy || recording) return;
    if (!needsGeneratedShortcutChoices(creator, thread.chapter, threadChoices(thread))) return;
    if (chipGenRef.current === chipGenKey) return;
    chipGenRef.current = chipGenKey;
    const turn = chipGenKey;
    void refreshThreadChoices(user, creatorRef.current, thread).then((next) => {
      const incoming = next.choicesByChapter[next.chapter] ?? [];
      if (incoming.length < 2) return;
      setThread((live) => {
        if (!live || chipTurnKey(live) !== turn) return live;
        if (!needsGeneratedShortcutChoices(creatorRef.current, live.chapter, threadChoices(live))) {
          return live;
        }
        if (!needsGeneratedShortcutChoices(creatorRef.current, live.chapter, incoming)) {
          const patched = {
            ...live,
            choicesByChapter: { ...live.choicesByChapter, [live.chapter]: incoming },
          };
          publishLiveThread(sessionKey, patched);
          return patched;
        }
        return live;
      });
    });
  }, [user, sessionKey, thread, busy, recording, tokenId, chipGenKey]);

  useEffect(() => {
    const list = listRef.current;
    if (list) {
      list.scrollTop = list.scrollHeight;
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: "instant", block: "end" });
  }, [messages.length, busy, choices.length, status]);

  useEffect(() => () => stopAudio(), []);

  async function send(text: string, opts?: { speak?: boolean }) {
    const content = text.trim();
    if (!content || busy || !thread || !user || !sessionKey) return;
    if (!beginChatSend(sessionKey, content)) return;
    setDraft("");
    setStatus(null);
    const optimistic = withOptimisticUserMessage(thread, content, `tmp-${uid()}`);
    publishLiveThread(sessionKey, optimistic);
    setThread(optimistic);

    const speak = Boolean(opts?.speak);
    try {
      const result = await sendChatForUser(user, creatorRef.current, thread, content, {
        fanSentVoice: speak,
      });
      if (!result.ok) {
        const failed = result.thread.messages.some((m) => m.error)
          ? result.thread
          : withSendErrorBubble(result.thread);
        const kept = keepSentThread(optimistic, failed);
        publishLiveThread(sessionKey, kept);
        setThread(kept);
        void persistChatThread(user, tokenId, kept);
        return;
      }
      setThread((prev) => {
        const pending = (prev ?? optimistic).messages.filter(
          (m) => (m.imagePending || m.voicePending) && !m.content.trim(),
        );
        const merged = keepSentThread(optimistic, {
          ...result.thread,
          messages: [...result.thread.messages, ...pending],
        });
        publishLiveThread(sessionKey, merged);
        return merged;
      });
      if (result.generatePhotos && !result.fallback) {
        void generateNewPhotosForUser(user, creatorRef.current, result.thread, {
          prompt: result.photoPrompt,
          tags: result.photoTags,
        }).catch(() => undefined);
      }
      if (result.wantVoice && !result.fallback) {
        const pendingId = `voice-pending-${Date.now()}`;
        const spoken = (result.voiceText || result.reply).trim();
        const chapterNow = result.assistantMessage.chapter;
        if (spoken) {
          setThread((prev) => {
          if (!prev) return prev;
          const withPending = {
            ...prev,
            messages: [
              ...prev.messages,
              {
                id: pendingId,
                role: "assistant" as const,
                content: "",
                chapter: chapterNow,
                voicePending: true,
              },
            ],
          };
          publishLiveThread(sessionKey, withPending);
          return withPending;
        });
        void attachChatVoiceForUser(user, result.thread, {
          spoken,
          chapter: chapterNow,
          voiceId: idolVoiceId(creatorRef.current),
          tokenId: creatorRef.current.tokenId,
        })
          .then((voice) => {
            setThread((prev) => {
              if (!prev) return prev;
              const without = prev.messages.filter((m) => m.id !== pendingId);
              if (!voice.ok || !voice.voiceMessage) {
                const cleared = { ...prev, messages: without };
                publishLiveThread(sessionKey, cleared);
                return cleared;
              }
              if (without.some((m) => m.id === voice.voiceMessage!.id || m.audioUrl === voice.voiceMessage!.audioUrl)) {
                const next = { ...prev, messages: without };
                publishLiveThread(sessionKey, next);
                return next;
              }
              const next = {
                ...prev,
                messages: [...without, voice.voiceMessage],
              };
              publishLiveThread(sessionKey, next);
              return next;
            });
          })
          .catch(() => {
            setThread((prev) => {
              if (!prev) return prev;
              const cleared = {
                ...prev,
                messages: prev.messages.filter((m) => m.id !== pendingId),
              };
              publishLiveThread(sessionKey, cleared);
              return cleared;
            });
          });
        }
      }
      if (result.wantImage && !result.fallback) {
        const chapterNow = result.assistantMessage.chapter;
        setThread((prev) => {
          if (!prev) return prev;
          const marked = rememberUsedImageId(prev, result.imageId);
          publishLiveThread(sessionKey, marked);
          return marked;
        });
        void attachChatImageForUser(user, creatorRef.current, result.thread, {
          reply: result.reply,
          chapter: chapterNow,
          imageId: result.imageId,
        })
          .then(async (img) => {
            const photo = img.ok ? img.imageMessage : undefined;
            if (!photo?.imageUrl) return;
            await preloadImage(photo.imageUrl);
            setThread((prev) => {
              if (!prev) return prev;
              if (prev.messages.some((m) => m.id === photo.id || m.imageUrl === photo.imageUrl)) {
                return prev;
              }
              const next = {
                ...prev,
                sceneId: img.ok ? img.thread.sceneId : prev.sceneId,
                sceneImages: img.ok ? img.thread.sceneImages : prev.sceneImages,
                usedImageIds: img.ok ? img.thread.usedImageIds : prev.usedImageIds,
                messages: [...prev.messages, photo],
              };
              publishLiveThread(sessionKey, next);
              return next;
            });
          })
          .catch(() => undefined);
      }
    } catch (err) {
      if (isUnauthorized(err)) {
        setBlocked("auth");
        return;
      }
      const kept = keepSentThread(optimistic, withSendErrorBubble(optimistic));
      publishLiveThread(sessionKey, kept);
      setThread(kept);
      void persistChatThread(user, tokenId, kept);
    } finally {
      endChatSend(sessionKey);
    }
  }

  async function startRecording() {
    if (busy || recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!holdActiveRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const mime = pickRecorderMime();
      const rec = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        void finishRecording(rec.mimeType);
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
      setStatus(null);
    } catch {
      setStatus("Microphone access is needed for voice chat");
    }
  }

  function stopRecording() {
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") {
      setRecording(false);
      return;
    }
    rec.stop();
    setRecording(false);
  }

  function onHoldPointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    if (inputMode !== "voice" || busy || recording) return;
    e.preventDefault();
    holdActiveRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    void startRecording();
  }

  function onHoldPointerEnd(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!holdActiveRef.current && !recording) return;
    holdActiveRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    stopRecording();
  }

  function toggleInputMode() {
    if (recording) stopRecording();
    setInputMode((m) => (m === "voice" ? "text" : "voice"));
  }

  async function finishRecording(mimeType: string) {
    const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
    chunksRef.current = [];
    if (blob.size < 800) {
      setStatus("Too short — say a bit more");
      return;
    }
    setTranscribing(true);
    setStatus("Listening…");
    try {
      const result = await transcribeAudio({
        data: { audioBase64: await blobToBase64(blob), mimeType: blob.type || mimeType },
      });
      if (!result.ok) {
        setStatus(result.error);
        setTranscribing(false);
        return;
      }
      setStatus(null);
      setTranscribing(false);
      await send(result.text, { speak: true });
    } catch (err) {
      if (isUnauthorized(err)) {
        setBlocked("auth");
        return;
      }
      setStatus("Couldn't hear that. Try again.");
      setTranscribing(false);
    }
  }

  if (blocked === "auth") {
    return (
      <Navigate to="/login" search={{ next: `/chat/${tokenId}` }} />
    );
  }
  if (blocked === "fan") {
    return (
      <Navigate
        to="/idol/$tokenId"
        params={{ tokenId: String(tokenId) }}
        search={{ needFan: false, becomeFan: false }}
      />
    );
  }
  if (blocked === "error") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted">Couldn't load chat</p>
        <button
          type="button"
          onClick={() => {
            setBlocked(null);
            setThread(null);
            setLoadKey((n) => n + 1);
          }}
          className="h-11 rounded-full bg-accent px-5 text-sm font-medium text-fg shadow-[0_8px_24px_rgb(192_38_255_/_0.28)]"
        >
          Try again
        </button>
      </div>
    );
  }
  if (!thread) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 text-sm text-muted">
        <span className="size-8 animate-spin rounded-full border-2 border-border border-t-accent" />
        Loading chat…
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-bg">
      <header className="flex shrink-0 items-center gap-2 border-b border-border/70 bg-header/80 px-2 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur-md">
        <Link
          to="/idol/$tokenId"
          params={{ tokenId: String(creator.tokenId) }}
          search={{ needFan: false, becomeFan: false }}
          className="lf-icon-btn"
          aria-label="Back"
        >
          <ChevronLeft className="size-7" strokeWidth={2} />
        </Link>
        <IdolAvatarRing
          src={creator.avatar}
          onOpen={creator.avatar ? () => setLightbox(creator.avatar) : undefined}
          className="size-10 ring-1 ring-border"
        />
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">
          {idolName(creator)}
        </h1>
        <div className="ml-auto flex shrink-0 items-center">
          <Link
            to="/chat/$tokenId/history"
            params={{ tokenId: String(creator.tokenId) }}
            className="lf-icon-btn text-fg/80"
            aria-label="Chat history"
          >
            <History className="size-5" />
          </Link>
        </div>
      </header>

      <div
        ref={listRef}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto overscroll-contain touch-pan-y px-4 pt-6 pb-4"
      >
        {messages.map((m) => (
          <ChatBubble
            key={m.id}
            msg={m}
            gate={gate}
            onOpenImage={setLightbox}
            onNsfwUnlocked={(msgId) => {
              if (!user) return;
              setThread((prev) => {
                if (!prev) return prev;
                const messages = prev.messages.map((row) =>
                  row.id === msgId ? { ...row, imageNsfwUnlocked: true } : row,
                );
                const next = { ...prev, messages };
                void persistChatThread(user, creator.tokenId, next);
                return next;
              });
            }}
          />
        ))}
        {busy ? (
          <div className="mr-auto flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-bubble-them px-4 py-3 ring-1 ring-border/50">
            <span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.2s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.1s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-muted" />
          </div>
        ) : null}
        {!busy && !recording && choices.length > 0 ? (
          <div className="flex flex-col items-end gap-2">
            {choices.map((choice) => (
              <button
                key={choice}
                type="button"
                disabled={Boolean(inFlightText)}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void send(choice);
                }}
                className="lf-draft-chip max-w-[78%] rounded-2xl rounded-br-md border-2 border-dashed border-bubble-me/70 bg-bubble-me/15 px-4 py-2.5 text-left text-md leading-relaxed text-fg/80"
              >
                {choice}
              </button>
            ))}
          </div>
        ) : null}
        {status ? (
          <p className="text-center text-sm text-muted">{status}</p>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 bg-gradient-to-t from-bg via-bg to-transparent px-3 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleInputMode}
            disabled={busy}
            className="lf-icon-btn size-11 shrink-0 rounded-xl bg-surface-2/80 ring-1 ring-border/60 disabled:opacity-50"
            aria-label={inputMode === "voice" ? "Text input" : "Hold to talk"}
          >
            {inputMode === "voice" ? (
              <Keyboard className="size-5" strokeWidth={2} />
            ) : (
              <Mic className="size-5" strokeWidth={2} />
            )}
          </button>

          {inputMode === "voice" ? (
            <button
              type="button"
              disabled={busy}
              onPointerDown={onHoldPointerDown}
              onPointerUp={onHoldPointerEnd}
              onPointerCancel={onHoldPointerEnd}
              onContextMenu={(e) => e.preventDefault()}
              className={cn(
                "flex h-12 min-w-0 flex-1 touch-none select-none items-center justify-center gap-2 rounded-2xl border bg-surface-2/90 px-4 text-md text-fg shadow-[0_10px_36px_rgb(0_0_0_/_0.35)] transition-colors disabled:opacity-50",
                recording
                  ? "border-danger/40 bg-choice ring-1 ring-danger/25"
                  : "border-border ring-0",
              )}
            >
              {recording ? (
                <>
                  <span className="size-2 animate-pulse rounded-full bg-danger" />
                  <Mic className="size-5 text-fg/90" />
                </>
              ) : (
                <Mic className="size-5 text-muted" />
              )}
            </button>
          ) : (
            <div className="flex h-12 min-w-0 flex-1 items-center gap-1 rounded-2xl border border-border bg-surface-2/90 pr-1 pl-3 shadow-[0_10px_36px_rgb(0_0_0_/_0.35)]">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  void send(draft);
                }}
                disabled={busy}
                placeholder="…"
                className="h-full min-w-0 flex-1 bg-transparent text-md text-fg placeholder:text-muted outline-none disabled:opacity-60"
              />
              <button
                type="button"
                disabled={busy || !draft.trim()}
                onClick={() => void send(draft)}
                className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-fg shadow-[0_6px_18px_rgb(192_38_255_/_0.35)] disabled:opacity-40"
                aria-label="Send"
              >
                <SendHorizontal className="size-5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {lightbox ? <PhotoLightbox src={lightbox} onClose={() => setLightbox(null)} /> : null}
    </div>
  );
}

function preloadImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
  });
}

export function ChatBubble({
  msg,
  gate,
  onOpenImage,
  onNsfwUnlocked,
}: {
  msg: ChatMsg;
  gate?: IdolMediaGate;
  onOpenImage?: (src: string) => void;
  onNsfwUnlocked?: (messageId: string) => void;
}) {
  if (isChatError(msg)) {
    return (
      <div
        className="mx-auto w-full max-w-[88%] rounded-2xl border border-danger/45 bg-danger/10 px-4 py-2.5 text-center text-sm leading-relaxed text-fg ring-1 ring-danger/20"
        role="alert"
      >
        {msg.content}
      </div>
    );
  }
  if (msg.role === "meta") {
    return (
      <div className="mx-auto w-full max-w-[88%] rounded-full border border-border/70 bg-chip/90 px-4 py-2 text-center text-sm text-muted">
        {msg.content}
      </div>
    );
  }
  if (msg.imagePending) {
    return (
      <div className="mr-auto flex h-44 w-36 items-center justify-center rounded-2xl bg-bubble-them ring-1 ring-border/50">
        <span className="size-7 animate-spin rounded-full border-2 border-muted border-t-fg" />
      </div>
    );
  }
  const content = msg.role === "assistant" ? sanitizeIdolReply(msg.content) : msg.content;
  if (
    msg.role === "assistant" &&
    !content.trim() &&
    !msg.imageUrl &&
    !msg.audioUrl &&
    !msg.voicePending
  ) {
    return null;
  }
  const imageOnly = Boolean(msg.imageUrl) && !content;
  if ((msg.audioUrl || msg.voicePending) && !content && !msg.imageUrl) {
    return <VoiceNoteBubble url={msg.audioUrl} pending={Boolean(msg.voicePending) && !msg.audioUrl} />;
  }
  return (
    <div
      className={cn(
        "max-w-[78%] break-words text-md leading-relaxed",
        imageOnly ? "rounded-2xl bg-transparent p-0" : "px-4 py-2.5",
        msg.role === "user"
          ? "ml-auto rounded-2xl rounded-br-md bg-bubble-me text-fg shadow-[0_6px_18px_rgb(92_36_130_/_0.28)]"
          : imageOnly
            ? "mr-auto"
            : "mr-auto rounded-2xl rounded-bl-md bg-bubble-them text-fg ring-1 ring-border/40",
      )}
    >
      {content ? <p>{content}</p> : null}
      {msg.imageUrl ? (
        <ChatImage
          src={msg.imageUrl}
          contentRating={msg.imageContentRating}
          messageUnlocked={msg.imageNsfwUnlocked}
          gate={gate}
          messageId={msg.id}
          onOpen={onOpenImage}
          onNsfwUnlocked={onNsfwUnlocked}
        />
      ) : null}
    </div>
  );
}

function VoiceNoteBubble({ url, pending }: { url?: string; pending: boolean }) {
  const playing = useSyncExternalStore(
    subscribeAudioPlayback,
    () => Boolean(url && playingAudioUrl() === url),
    () => false,
  );
  const [secs, setSecs] = useState<number | null>(null);
  useEffect(() => {
    if (!url) {
      setSecs(null);
      return;
    }
    const audio = new Audio();
    audio.preload = "metadata";
    const onMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setSecs(Math.max(1, Math.round(audio.duration)));
      }
    };
    audio.addEventListener("loadedmetadata", onMeta);
    audio.src = url;
    return () => {
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.src = "";
    };
  }, [url]);
  const width = secs ? Math.min(56 + secs * 8, 176) : 72;
  return (
    <div className="mr-auto flex items-center gap-2">
      <button
        type="button"
        disabled={pending || !url}
        onClick={() => {
          if (url) void playAudioUrl(url);
        }}
        aria-label={pending ? "语音生成中" : playing ? "停止播放" : "播放语音"}
        className={cn(
          "flex h-10 items-center rounded-2xl rounded-bl-md bg-bubble-them pl-3 ring-1 ring-border/40",
          pending && "cursor-wait",
        )}
        style={{ width }}
      >
        {pending ? (
          <span className="size-4 animate-spin rounded-full border-2 border-muted border-t-fg" />
        ) : (
          <WeChatVoiceGlyph playing={playing} />
        )}
      </button>
      {secs != null && !pending ? (
        <span className="text-xs tabular-nums text-muted">{secs}"</span>
      ) : null}
    </div>
  );
}

function WeChatVoiceGlyph({ playing }: { playing: boolean }) {
  return (
    <svg
      viewBox="0 0 28 20"
      className="lf-voice-wave size-7 text-fg"
      data-playing={playing ? "true" : "false"}
      aria-hidden
    >
      <path
        d="M3.2 7.2h3.1L11 3.4v13.2L6.3 12.8H3.2c-.7 0-1.2-.5-1.2-1.2V8.4c0-.7.5-1.2 1.2-1.2Z"
        fill="currentColor"
      />
      <path
        className="lf-voice-arc-1"
        d="M14.2 7.2a4 4 0 0 1 0 5.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        className="lf-voice-arc-2"
        d="M17.4 5.2a7.2 7.2 0 0 1 0 9.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        className="lf-voice-arc-3"
        d="M20.6 3.4a10.2 10.2 0 0 1 0 13.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChatImage({
  src,
  contentRating,
  messageUnlocked,
  gate,
  messageId,
  onOpen,
  onNsfwUnlocked,
}: {
  src: string;
  contentRating?: "SFW" | "NSFW";
  messageUnlocked?: boolean;
  gate?: IdolMediaGate;
  messageId: string;
  onOpen?: (src: string) => void;
  onNsfwUnlocked?: (messageId: string) => void;
}) {
  const locked = gate ? gate.isLocked(src, contentRating, messageUnlocked) : false;
  if (gate) {
    return (
      <div className="relative mt-0 max-h-56 w-full overflow-hidden rounded-xl">
        <IdolGatedPhoto
          src={src}
          locked={locked}
          onActivate={() =>
            gate.unlockImage(src).then(() => onNsfwUnlocked?.(messageId))
          }
          onOpen={() => onOpen?.(src)}
          imgClassName="max-h-56 w-full"
          className="max-h-56 w-full"
        />
      </div>
    );
  }
  return (
    <button
      type="button"
      className="relative mt-0 block overflow-hidden rounded-xl"
      onClick={() => onOpen?.(src)}
    >
      <GatedIdolImage
        src={src}
        locked={false}
        loading="lazy"
        decoding="async"
        className="max-h-56 w-full"
        imgClassName="max-h-56 w-full"
      />
    </button>
  );
}
