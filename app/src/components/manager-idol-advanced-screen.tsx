import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, Heart, ImageIcon, Tag } from "lucide-react";
import { ActionGlyphButton } from "@/components/action-glyph-button";
import { ManagerSceneList } from "@/components/manager-scene-list";
import { isActionGlyphBusy } from "@/lib/action-glyph";
import { idolName, idolPersonality, idolWelcome } from "@/lib/idol-fields";
import type { FlexibleScene } from "@/lib/idols";
import {
  fetchTbaUsdcBalance,
  resolveIdolTbaAddress,
  withdrawIdolTbaUsdcToOwner,
  writeIdolSalePriceOnChain,
} from "@/lib/idol-manager-onchain";
import {
  formatUsdcPrice,
  idolImageUnlockPriceUsdc,
  idolSubscribePriceUsdc,
  salePriceDraft,
  parseUsdcAmountField,
  parseUsdcInput,
} from "@/lib/idol-pricing";
import { useActionGlyph } from "@/lib/use-action-glyph";
import { useManagerIdolEditor } from "@/lib/use-manager-idol-editor";
import { designVoice } from "@/lib/ai";
import { signVoiceDesign } from "@/lib/voice-design-proof";
import { cn } from "@/lib/utils";

const VOICE_PREVIEW_TEXT = "你好，很高兴认识你。今天想和我聊点什么？";

export function ManagerIdolAdvancedScreen({ tokenId }: { tokenId: number | null }) {
  const {
    idol,
    missing,
    loading,
    canEdit,
    persistNamed,
    persistPublic,
    isPublic,
  } = useManagerIdolEditor(tokenId);
  const saveAction = useActionGlyph();
  const withdrawAction = useActionGlyph();
  const publicAction = useActionGlyph();
  const voiceAction = useActionGlyph();
  const fieldsLocked =
    !canEdit ||
    isActionGlyphBusy(saveAction.status) ||
    isActionGlyphBusy(publicAction.status) ||
    isActionGlyphBusy(voiceAction.status);

  const [draftPersonality, setDraftPersonality] = useState("");
  const [draftWelcome, setDraftWelcome] = useState("");
  const [draftSubscribe, setDraftSubscribe] = useState("");
  const [draftImageUnlock, setDraftImageUnlock] = useState("");
  const [draftSale, setDraftSale] = useState("");
  const [draftLook, setDraftLook] = useState("");
  const [voicePrompt, setVoicePrompt] = useState("");
  const [voicePreview, setVoicePreview] = useState<{ voiceId: string; audioBase64: string } | null>(null);
  const [draftScenes, setDraftScenes] = useState<FlexibleScene[]>([]);
  const [tbaUsdcAtomic, setTbaUsdcAtomic] = useState<bigint | null>(null);

  useEffect(() => {
    if (!idol) return;
    setDraftPersonality(idolPersonality(idol));
    setDraftWelcome(idolWelcome(idol));
    setDraftSubscribe(String(idolSubscribePriceUsdc(idol)));
    setDraftImageUnlock(String(idolImageUnlockPriceUsdc(idol)));
    setDraftSale(salePriceDraft(idol.salePriceUsdc));
    setDraftLook(idol.look);
    setVoicePreview(null);
    setDraftScenes(idol.scenes);
  }, [idol]);

  useEffect(() => {
    if (!idol || !canEdit) {
      setTbaUsdcAtomic(null);
      return;
    }
    void (async () => {
      const tba = await resolveIdolTbaAddress(idol.tokenId);
      if (!tba) {
        setTbaUsdcAtomic(0n);
        return;
      }
      setTbaUsdcAtomic(await fetchTbaUsdcBalance(tba));
    })();
  }, [idol, canEdit]);

  const tbaBalanceLabel = useMemo(() => {
    if (tbaUsdcAtomic === null) return "…";
    const usdc = Number(tbaUsdcAtomic) / 1_000_000;
    return formatUsdcPrice(usdc);
  }, [tbaUsdcAtomic]);

  function onSave() {
    if (!idol || !canEdit) return;
    void saveAction.run(async () => {
      const sub = parseUsdcInput(draftSubscribe);
      const img = parseUsdcInput(draftImageUnlock);
      if (sub == null || img == null) throw new Error("Enter a valid amount");
      const sale = parseUsdcAmountField(draftSale);
      if (sale == null) throw new Error("Enter a valid amount");
      const voiceId = voicePreview?.voiceId ?? idol.voice.trim();
      if (!voiceId) throw new Error("请先生成并试听声音");
      await persistNamed({
        personality: draftPersonality.trim(),
        welcome: draftWelcome.trim(),
        subscribePriceUsdc: sub,
        imageUnlockPriceUsdc: img,
        look: draftLook.trim(),
        voice: voiceId,
        scenes: draftScenes,
      });
      await writeIdolSalePriceOnChain(idol.tokenId, sale);
    });
  }

  function onGenerateVoice() {
    if (!idol || !canEdit) return;
    void voiceAction.run(async () => {
      const payload = {
        tokenId: idol.tokenId,
        prompt: voicePrompt.trim(),
        previewText: VOICE_PREVIEW_TEXT,
        issuedAt: Date.now(),
      };
      const proof = await signVoiceDesign(payload);
      const result = await designVoice({
        data: { ...payload, proof },
      });
      if (!result.ok) throw new Error(result.error);
      setVoicePreview({ voiceId: result.voiceId, audioBase64: result.audioBase64 });
    });
  }

  function onWithdraw() {
    if (!idol || !canEdit) return;
    void withdrawAction.run(async () => {
      await withdrawIdolTbaUsdcToOwner(idol.tokenId);
      setTbaUsdcAtomic(0n);
    });
  }

  if (missing) {
    return (
      <main className="flex h-full min-h-0 flex-col items-center justify-center overflow-hidden px-6 text-center">
        <p className="text-sm text-muted">Couldn't find this idol.</p>
        <Link to="/me/manager" className="mt-4 text-sm text-accent underline">
          返回经纪人中心
        </Link>
      </main>
    );
  }

  if (loading || !idol) {
    return (
      <main className="flex h-full min-h-0 items-center justify-center overflow-hidden">
        <div className="size-10 animate-pulse rounded-full bg-surface-2" />
      </main>
    );
  }

  const backTo = {
    to: "/me/manager/$tokenId" as const,
    params: { tokenId: String(idol.tokenId) },
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-bg">
      <header className="flex shrink-0 items-center gap-2 border-b border-border/70 bg-header/80 px-2 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur-md">
        <Link {...backTo} className="lf-icon-btn" aria-label="Back">
          <ChevronLeft className="size-7" strokeWidth={2} />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">
          {idolName(idol)}
        </h1>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <textarea
          value={draftPersonality}
          onChange={(e) => setDraftPersonality(e.target.value)}
          maxLength={2000}
          rows={5}
          disabled={fieldsLocked}
          aria-label="人设"
          className="lf-search min-h-[8rem] resize-none py-3 leading-relaxed"
        />

        <label className="mt-4 block text-xs text-muted">欢迎词</label>
        <textarea
          value={draftWelcome}
          onChange={(e) => setDraftWelcome(e.target.value)}
          maxLength={500}
          rows={3}
          disabled={fieldsLocked}
          aria-label="欢迎词"
          className="lf-search mt-1 min-h-[4rem] resize-none py-3 text-sm leading-relaxed"
        />

        <div className="mt-4 flex flex-col gap-2">
          <label className="flex items-center gap-2 rounded-xl border border-border/60 bg-surface-2/40 px-3 py-2.5">
            <Heart className="size-4 shrink-0 text-muted" strokeWidth={1.75} aria-hidden />
            <span className="sr-only">订阅</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={draftSubscribe}
              onChange={(e) => setDraftSubscribe(e.target.value)}
              disabled={fieldsLocked}
              aria-label="订阅"
              className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none"
            />
            <span className="text-xs text-muted">LUSD</span>
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-border/60 bg-surface-2/40 px-3 py-2.5">
            <ImageIcon className="size-4 shrink-0 text-muted" strokeWidth={1.75} aria-hidden />
            <span className="sr-only">单图</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={draftImageUnlock}
              onChange={(e) => setDraftImageUnlock(e.target.value)}
              disabled={fieldsLocked}
              aria-label="单图"
              className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none"
            />
            <span className="text-xs text-muted">LUSD</span>
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-border/60 bg-surface-2/40 px-3 py-2.5">
            <Tag className="size-4 shrink-0 text-muted" strokeWidth={1.75} aria-hidden />
            <span className="sr-only">出售价格</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={draftSale}
              onChange={(e) => setDraftSale(e.target.value)}
              disabled={fieldsLocked}
              aria-label="出售价格"
              placeholder="不出售"
              className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-muted"
            />
            <span className="text-xs text-muted">{draftSale.trim() ? "LUSD" : ""}</span>
          </label>
        </div>

        <section className="mt-4 rounded-2xl border border-border/70 bg-surface-2/60 px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-fg">{isPublic ? "已公开" : "未公开"}</span>
            {canEdit ? (
              <ActionGlyphButton
                status={publicAction.status}
                idleLabel={isPublic ? "隐藏" : "公开"}
                pendingLabel="提交中…"
                onClick={() => void publicAction.run(() => persistPublic(!isPublic))}
                className={cn(
                  "rounded-full border px-4 py-2 text-xs font-medium",
                  isPublic
                    ? "border-amber-500/50 text-amber-200"
                    : "border-accent/50 text-accent",
                )}
              >
                {isPublic ? "隐藏" : "公开"}
              </ActionGlyphButton>
            ) : null}
          </div>
        </section>

        {canEdit ? (
          <section className="mt-4 rounded-2xl border border-border/70 bg-surface-2/60 px-3 py-3">
            <p className="text-sm font-medium text-fg">{tbaBalanceLabel}</p>
            <ActionGlyphButton
              status={withdrawAction.status}
              disabled={tbaUsdcAtomic === null || tbaUsdcAtomic <= 0n || isActionGlyphBusy(saveAction.status)}
              idleLabel="提现到我的钱包"
              pendingLabel="提现中…"
              onClick={() => onWithdraw()}
              className="mt-3 h-10 w-full rounded-full border border-accent/50 bg-bg text-sm font-medium text-fg disabled:opacity-45"
            >
              提现到我的钱包
            </ActionGlyphButton>
          </section>
        ) : null}

        <label className="mt-4 block text-xs text-muted">Look</label>
        <textarea
          value={draftLook}
          onChange={(e) => setDraftLook(e.target.value)}
          rows={3}
          disabled={fieldsLocked}
          className="lf-search mt-1 min-h-[4rem] resize-none py-3 text-sm leading-relaxed"
        />
        <section className="mt-4 rounded-2xl border border-border/70 bg-surface-2/60 p-3">
          <label className="block text-xs text-muted" htmlFor="voice-prompt">
            声音设定
          </label>
          <textarea
            id="voice-prompt"
            value={voicePrompt}
            onChange={(e) => {
              setVoicePrompt(e.target.value);
              setVoicePreview(null);
            }}
            disabled={fieldsLocked}
            maxLength={500}
            rows={3}
            placeholder="例如：二十多岁女声，轻柔略带气声，中文自然，语速稍慢。"
            className="lf-search mt-1 min-h-[5.5rem] resize-none py-3 text-sm leading-relaxed"
          />
          <ActionGlyphButton
            status={voiceAction.status}
            disabled={!voicePrompt.trim() || isActionGlyphBusy(saveAction.status)}
            idleLabel="生成试听"
            pendingLabel="生成试听中…"
            successLabel="试听已生成"
            onClick={onGenerateVoice}
            className="mt-3 flex h-10 w-full items-center justify-center rounded-full border border-accent/50 bg-bg text-sm font-medium text-fg disabled:opacity-45"
          >
            生成试听
          </ActionGlyphButton>
          {voicePreview ? (
            <div className="mt-3 rounded-xl border border-border/60 bg-bg/60 p-3">
              <p className="text-xs text-muted">试听满意后，点击页面底部“保存”才会把这个声音写入链上。</p>
              <audio className="mt-2 h-9 w-full" controls src={`data:audio/mpeg;base64,${voicePreview.audioBase64}`} />
            </div>
          ) : idol.voice.trim() ? (
            <p className="mt-3 text-xs text-muted">当前已保存 MiniMax 声音。</p>
          ) : null}
        </section>
        <ManagerSceneList
          scenes={draftScenes}
          onChange={setDraftScenes}
          disabled={fieldsLocked}
        />

        {canEdit ? (
          <ActionGlyphButton
            status={saveAction.status}
            disabled={isActionGlyphBusy(withdrawAction.status)}
            idleLabel="保存"
            pendingLabel="保存中…"
            onClick={onSave}
            className="mt-5 mb-4 flex h-11 w-full items-center justify-center rounded-full bg-accent text-sm font-medium text-fg shadow-[0_8px_24px_rgb(192_38_255_/_0.28)] transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
          >
            保存
          </ActionGlyphButton>
        ) : null}
      </div>
    </div>
  );
}
