import { useEffect, useRef, useState } from "react";
import { Fingerprint, Plus, X } from "lucide-react";
import { signInWithPasskey } from "./client";
import { hasPrefetchedPasskeyChallenge, prefetchPasskeyChallenge } from "./passkey-client";

const FIELD =
  "h-12 w-full rounded-2xl border border-border bg-surface-2 px-4 text-md text-fg placeholder:text-muted outline-none transition-[box-shadow,border-color] focus:border-accent/60 focus:shadow-[0_0_0_3px_rgb(192_38_255_/_0.18)] disabled:opacity-70";
const CARD =
  "w-full max-w-xs rounded-3xl border border-border bg-surface/80 p-4 shadow-[0_20px_60px_rgb(0_0_0_/_0.35)] backdrop-blur-md";

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Cross-origin iframe (Grok web preview). Apple's in-app Safari sheet is NOT this. */
function isCrossOriginIframe(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/**
 * WKWebView (Grok/X in-app browsers) cannot present iCloud passkeys unless the
 * host app associated our domain. SFSafariViewController has no messageHandlers
 * and can run WebAuthn.
 */
function isAppleWkWebView(): boolean {
  if (!isIOS() || typeof window === "undefined") return false;
  const webkit = (window as Window & { webkit?: { messageHandlers?: unknown } }).webkit;
  return Boolean(webkit?.messageHandlers);
}

function webauthnReady(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof window.PublicKeyCredential === "function"
  );
}

function errorName(err: unknown): string {
  return err && typeof err === "object" && "name" in err ? String(err.name) : "";
}

function iosSafariHint(): string {
  return "This in-app browser can't use passkeys. Tap the Safari icon (compass) at the bottom, then sign in.";
}

function deniedCopy(creating: boolean): string {
  if (isAppleWkWebView()) return iosSafariHint();
  return creating
    ? "Verification didn't finish. Tap create again."
    : "Verification didn't finish. Tap again.";
}

function failCopy(err: unknown, creating: boolean): string {
  const name = errorName(err);
  if (name === "NotAllowedError" || name === "AbortError") return deniedCopy(creating);
  if (name === "InvalidStateError") {
    return "This passkey is already on this device. Use Login on the left.";
  }
  const msg = err instanceof Error ? err.message : "";
  if (msg === "grok_gate" || msg === "passkey_http") {
    return "Grok's gateway blocked sign-in. Refresh and try again.";
  }
  if (msg === "wallet_rpc") return "Couldn't read the on-chain wallet. Try again.";
  if (msg === "unknown_passkey" || msg.startsWith("unknown_passkey")) {
    return "Last create didn't finish registering. Tap + in the top right and create again with the same name.";
  }
  if (msg === "Unauthorized" || msg.startsWith("Unauthorized")) {
    const reason = msg.replace(/^Unauthorized\s*/, "").trim();
    return creating
      ? `Couldn't verify create${reason ? ` (${reason})` : ""}. Try again.`
      : `Couldn't verify passkey${reason ? ` (${reason})` : ""}. Try again.`;
  }
  return creating ? "Couldn't create. Try again." : "Couldn't sign in. Try again.";
}

export function PasskeySignIn({ callbackURL = "/" }: { callbackURL?: string }) {
  const [busy, setBusy] = useState<"login" | "signup" | null>(null);
  const [signUpOpen, setSignUpOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [challengeReady, setChallengeReady] = useState(hasPrefetchedPasskeyChallenge);
  const nameRef = useRef<HTMLInputElement>(null);
  const named = name.trim().length > 0;
  const iframe = isCrossOriginIframe();
  const ios = isIOS();

  useEffect(() => {
    void prefetchPasskeyChallenge()
      .catch(() => undefined)
      .finally(() => setChallengeReady(true));
  }, []);

  function closeSignUp() {
    if (busy === "signup") return;
    setSignUpOpen(false);
    setName("");
  }

  useEffect(() => {
    if (!signUpOpen) return;
    nameRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSignUp();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [signUpOpen, busy]);

  function login() {
    if (busy || !challengeReady) return;
    setError(null);
    if (!webauthnReady()) {
      setError(isAppleWkWebView() ? iosSafariHint() : "This page doesn't support passkeys");
      return;
    }
    // Desktop Grok iframe cannot run WebAuthn. iOS in-app Safari is top-level — try it.
    if (iframe && !ios) {
      const opened = window.open(window.location.href, "_blank");
      if (!opened) setError("Open in a new tab, then sign in");
      return;
    }
    setBusy("login");
    void signInWithPasskey(callbackURL).catch((err) => {
      setBusy(null);
      setError(failCopy(err, false));
    });
  }

  function create() {
    if (busy || !named) {
      nameRef.current?.focus();
      return;
    }
    setError(null);
    if (!webauthnReady()) {
      setError(isAppleWkWebView() ? iosSafariHint() : "This page doesn't support passkeys");
      return;
    }
    if (iframe && !ios) {
      const opened = window.open(window.location.href, "_blank");
      if (!opened) setError("Open in a new tab, then sign in");
      return;
    }
    setBusy("signup");
    void signInWithPasskey(callbackURL, { createName: name }).catch((err) => {
      setBusy(null);
      setError(failCopy(err, true));
    });
  }

  const blocked = busy !== null || !challengeReady;

  return (
    <>
      <div className={`relative mt-8 ${CARD}`}>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={blocked}
            onClick={login}
            className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-accent text-fg shadow-[0_8px_24px_rgb(192_38_255_/_0.28)] transition-opacity hover:opacity-95 disabled:opacity-70"
            aria-label="Login"
          >
            {busy === "login" ? (
              <span className="text-md">…</span>
            ) : (
              <Fingerprint className="size-6" strokeWidth={1.75} />
            )}
          </button>
          <button
            type="button"
            disabled={blocked}
            onClick={() => {
              setName("");
              setError(null);
              setSignUpOpen(true);
            }}
            className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface-2 text-fg transition-colors hover:bg-surface-3 disabled:opacity-70"
            aria-label="Sign up"
          >
            <Plus className="size-6" strokeWidth={1.75} />
          </button>
        </div>
        {error && !signUpOpen ? <p className="mt-3 text-center text-sm text-danger">{error}</p> : null}
      </div>
      {signUpOpen ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center px-6">
          <button
            type="button"
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
            aria-label="Close"
            disabled={busy === "signup"}
            onClick={closeSignUp}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Sign up"
            className={`relative z-10 ${CARD}`}
          >
            <div className="mb-3 flex items-center justify-end">
              <button
                type="button"
                onClick={closeSignUp}
                disabled={busy === "signup"}
                className="flex size-9 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-45"
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>
            {error ? <p className="mb-3 text-center text-sm text-danger">{error}</p> : null}
            <form
              className="flex flex-col"
              onSubmit={(e) => {
                e.preventDefault();
                create();
              }}
            >
              <input
                ref={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="username"
                autoCapitalize="words"
                spellCheck={false}
                maxLength={64}
                placeholder="username"
                aria-label="username"
                disabled={busy === "signup"}
                className={FIELD}
              />
              <button
                type="submit"
                disabled={busy === "signup" || !named || !challengeReady}
                className="mt-5 flex h-11 w-full items-center justify-center rounded-full bg-accent text-fg shadow-[0_8px_24px_rgb(192_38_255_/_0.28)] transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
                aria-label="Sign up"
              >
                {busy === "signup" ? (
                  <span className="text-md">…</span>
                ) : (
                  <Plus className="size-6" strokeWidth={1.75} />
                )}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
