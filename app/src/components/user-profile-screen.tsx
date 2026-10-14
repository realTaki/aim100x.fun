import { ApiWalletBalance } from "./api-wallet-balance";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LogOut, RotateCcw, Save, Upload } from "lucide-react";
import { ActionGlyphButton } from "@/components/action-glyph-button";
import { pushActionError } from "@/lib/action-error";
import { useActionGlyph } from "@/lib/use-action-glyph";
import { authEnabled, signOut } from "@/lib/auth/client";
import { hasGateSessionMarker } from "@/lib/auth/gate-session-marker";
import { formatAccountLabel, shortWalletAddress } from "@/lib/auth/account-host";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { UserProfileAvatar } from "@/components/user-profile-avatar";
import { LonelyUsdFaucet } from "@/components/lonely-usd-faucet";
import { cn } from "@/lib/utils";
import { useUserProfile } from "@/lib/user-profile/use-user-profile";
import { shouldHydrateProfileForm } from "@/lib/user-profile/hydrate";
import { walletAddressFromUser } from "@/lib/user-profile/wallet-address";
import { profileLocaleOptions } from "@/lib/locale";

const MAX_AVATAR_BYTES = 512_000;

const subscribeToNothing = () => () => {};
const noGateSessionOnServer = () => false;

export function UserProfileScreen() {
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const { profile, defaultAvatarUrl, save } = useUserProfile(user);
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [locale, setLocale] = useState("");
  const [languageSelected, setLanguageSelected] = useState(false);
  const [draftCustomAvatar, setDraftCustomAvatar] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const saveAction = useActionGlyph();
  const fileRef = useRef<HTMLInputElement>(null);
  const appliedProfileRef = useRef<{
    key: string;
    username: string;
    bio: string;
    locale: string;
    customAvatar: string | null;
  } | null>(null);
  const activeUserIdRef = useRef<string | null>(null);
  const gateSession = useSyncExternalStore(
    subscribeToNothing,
    hasGateSessionMarker,
    noGateSessionOnServer,
  );
  const trimmedUsername = username.trim();
  const trimmedBio = bio.trim();
  const isDirty = useMemo(
    () =>
      trimmedUsername !== profile.username ||
      trimmedBio !== profile.bio ||
      locale !== profile.locale ||
      languageSelected ||
      draftCustomAvatar !== profile.customAvatar,
    [trimmedUsername, trimmedBio, locale, languageSelected, draftCustomAvatar, profile],
  );

  useEffect(() => {
    if (!user) {
      activeUserIdRef.current = null;
      appliedProfileRef.current = null;
      return;
    }
    if (activeUserIdRef.current !== user.id) {
      activeUserIdRef.current = user.id;
      appliedProfileRef.current = null;
      setLanguageSelected(false);
    }
    const profileKey = `${user.id}\0${profile.username}\0${profile.bio}\0${profile.locale}\0${profile.customAvatar ?? ""}`;
    const applied = appliedProfileRef.current;
    if (applied?.key === profileKey) return;

    const formMatchesLastApply =
      applied !== null &&
      username === applied.username &&
      bio === applied.bio &&
      locale === applied.locale &&
      draftCustomAvatar === applied.customAvatar;

    if (
      !shouldHydrateProfileForm({
        applied,
        profileKey,
        isDirty,
        formMatchesLastApply,
      })
    ) {
      return;
    }

    setUsername(profile.username);
    setBio(profile.bio);
    setLocale(profile.locale);
    setDraftCustomAvatar(profile.customAvatar);
    appliedProfileRef.current = {
      key: profileKey,
      username: profile.username,
      bio: profile.bio,
      locale: profile.locale,
      customAvatar: profile.customAvatar,
    };
  }, [
    user,
    profile.username,
    profile.bio,
    profile.locale,
    profile.customAvatar,
    username,
    bio,
    locale,
    draftCustomAvatar,
    isDirty,
  ]);

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (isPending) return;
    if (!user) {
      void navigate({ to: "/login", search: { next: "/me" } });
    }
  }, [user, isPending, navigate]);

  if (isPending || !user) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <div className="size-10 animate-pulse rounded-full bg-surface-2" />
      </div>
    );
  }

  const wallet = walletAddressFromUser(user);
  const accountLabel = wallet ? shortWalletAddress(wallet) : formatAccountLabel(user);
  const showSignOut = authEnabled && !gateSession;
  const previewAvatarUrl = draftCustomAvatar ?? defaultAvatarUrl;

  async function onSave() {
    if (!isDirty) return;
    await saveAction.run(async () => {
      const ok = save(
        {
          username: trimmedUsername,
          bio: trimmedBio,
          customAvatar: draftCustomAvatar,
          locale,
        },
        languageSelected,
      );
      if (!ok) throw new Error("Couldn't save");
      setLanguageSelected(false);
    });
  }

  function onPickAvatar() {
    fileRef.current?.click();
  }

  async function onAvatarFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      pushActionError("Choose an image file.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      pushActionError("Image must be under 500 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== "string") return;
      setDraftCustomAvatar(dataUrl);
    };
    reader.onerror = () => pushActionError("Could not read that image.");
    reader.readAsDataURL(file);
  }

  function resetAvatar() {
    setDraftCustomAvatar(null);
  }

  return (
    <>
      <section className="mt-5 flex flex-col items-center">
        {previewAvatarUrl ? (
          <button
            type="button"
            onClick={onPickAvatar}
            aria-label="Upload photo"
            className="relative size-24 overflow-hidden rounded-full ring-2 ring-avatar-ring"
          >
            <UserProfileAvatar src={previewAvatarUrl} className="size-full ring-0" />
            <span className="pointer-events-none absolute inset-x-0 bottom-0 flex h-8 items-center justify-center bg-gradient-to-t from-black/70 to-transparent">
              <Upload className="size-4 text-white" strokeWidth={2.25} />
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onPickAvatar}
            aria-label="Upload photo"
            className="relative grid size-24 place-items-center overflow-hidden rounded-full bg-surface-2 ring-2 ring-avatar-ring"
          >
            <Upload className="size-6 text-muted" strokeWidth={1.75} />
          </button>
        )}
        <p className="mt-3 text-sm text-muted">{accountLabel}</p>
        {user.apiWalletAddress ? (
          <ApiWalletBalance key={user.apiWalletAddress} account={user.apiWalletAddress} />
        ) : null}
        <p className="mt-3 max-w-sm text-xs text-muted">
          NFTs, subscriptions and tips use your APP wallet on Monad Testnet. Faucet, subscription
          and text-chat gas are funded by the platform on Monad Testnet.
        </p>
        {wallet ? <LonelyUsdFaucet key={wallet} account={wallet} /> : null}
        {draftCustomAvatar && defaultAvatarUrl ? (
          <button
            type="button"
            onClick={resetAvatar}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border/70 px-4 py-2 text-sm text-muted transition-colors hover:text-fg"
          >
            <RotateCcw className="size-4" />
            Wallet avatar
          </button>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            void onAvatarFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </section>

      <section className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="text-xs font-medium tracking-wide text-muted uppercase">
            Preferred language
          </span>
          <select
            value={locale}
            onChange={(e) => {
              setLocale(e.target.value);
              setLanguageSelected(true);
            }}
            className="lf-form-field appearance-none"
          >
            {locale ? null : (
              <option value="" disabled>
                Choose preferred language
              </option>
            )}
            {profileLocaleOptions(locale).map((row) => (
              <option key={row.value} value={row.value}>
                {row.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-xs font-medium tracking-wide text-muted uppercase">Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={accountLabel}
            maxLength={32}
            className="lf-form-field"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-xs font-medium tracking-wide text-muted uppercase">Bio</span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="A line about you…"
            maxLength={280}
            rows={4}
            className="lf-form-field min-h-28 resize-y leading-relaxed"
          />
        </label>

        <div className="flex flex-col items-center gap-2 pt-1">
          <ActionGlyphButton
            status={saveAction.status}
            onClick={() => void onSave()}
            disabled={!isDirty}
            idleLabel="Save"
            pendingLabel="Saving"
            successLabel="Saved"
            className={cn(
              "flex size-11 items-center justify-center rounded-full bg-accent text-fg shadow-[0_8px_24px_rgb(192_38_255_/_0.28)] transition-opacity",
              saveAction.status === "idle" && "disabled:cursor-not-allowed disabled:opacity-45",
            )}
          >
            <Save aria-hidden className="size-5" strokeWidth={2.25} />
          </ActionGlyphButton>
        </div>
      </section>

      {showSignOut ? (
        <div className="mt-auto pt-12">
          <button
            type="button"
            disabled={signingOut}
            onClick={() => {
              setSigningOut(true);
              void signOut("/").catch(() => setSigningOut(false));
            }}
            aria-label={signingOut ? "Signing out" : "Sign out"}
            title={signingOut ? "Signing out" : "Sign out"}
            className="mx-auto flex size-11 items-center justify-center rounded-full text-danger transition-colors hover:bg-danger/10 disabled:opacity-60"
          >
            <LogOut aria-hidden className="size-5" strokeWidth={1.75} />
          </button>
        </div>
      ) : null}
    </>
  );
}
