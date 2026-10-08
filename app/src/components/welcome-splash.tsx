import { WELCOME_COPY, type WelcomeError } from "@/lib/welcome-copy";
import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { FaceIdFail } from "@/components/face-id-fail";
import { PasscodePad } from "@/components/passcode-pad";
import { SwipeUnlock } from "@/components/swipe-unlock";
import { FACE_ID_FAIL_MS, markWelcomeEntered, PLAZA_PATH } from "@/lib/welcome-entry";
import { refreshWalletSession, signOut } from "@/lib/auth/client";
import {
  createPrivacyPin,
  hasPrivacyPin,
  privacyPinFailures,
  setPrivacyUnlocked,
  verifyPrivacyPin,
} from "@/lib/privacy-pin";

type Phase = "swipe" | "checking" | "face-fail" | "pin" | "error";

export function WelcomeSplash({
  coverSrc,
  next = PLAZA_PATH,
  autoCheck = false,
}: {
  coverSrc: string;
  next?: string;
  autoCheck?: boolean;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("swipe");
  const [now, setNow] = useState<Date | null>(null);
  const [userId, setUserId] = useState("");
  const [mode, setMode] = useState<"setup" | "confirm" | "unlock">("unlock");
  const [firstPin, setFirstPin] = useState("");
  const text = WELCOME_COPY;
  const [error, setError] = useState<WelcomeError | "">("");
  const [remainingAttempts, setRemainingAttempts] = useState(0);
  const errorText =
    error === "wrongPin"
      ? text.errors.wrongPin(remainingAttempts)
      : error
        ? text.errors[error]
        : "";

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setPrivacyUnlocked(false);
    if (autoCheck) setPhase("checking");
  }, [autoCheck]);

  useEffect(() => {
    if (phase !== "checking") return;
    let cancelled = false;
    void (async () => {
      const row = await refreshWalletSession();
      if (cancelled) return;
      if (!row) {
        setPhase("face-fail");
        return;
      }
      const data = { userId: row.id };
      if (privacyPinFailures(data.userId) >= 3) {
        await signOut(`/welcome?next=${encodeURIComponent(next)}`);
        return;
      }
      setUserId(data.userId);
      setMode(hasPrivacyPin(data.userId) ? "unlock" : "setup");
      setPhase("pin");
    })().catch(() => {
      if (!cancelled) {
        setError("storageUnavailable");
        setPhase("error");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [phase, attempt, next]);

  const completePin = async (pin: string): Promise<boolean> => {
    setError("");
    if (mode === "setup") {
      setFirstPin(pin);
      setMode("confirm");
      return true;
    }
    if (mode === "confirm" && pin !== firstPin) {
      setError("mismatch");
      setFirstPin("");
      setMode("setup");
      return false;
    }
    try {
      if (mode === "confirm") await createPrivacyPin(userId, pin);
      else {
        const result = await verifyPrivacyPin(userId, pin);
        if (result === "sign-out") {
          setError("signingOut");
          await signOut(`/welcome?next=${encodeURIComponent(next)}`);
          return false;
        }
        if (result === "wrong") {
          setRemainingAttempts(3 - privacyPinFailures(userId));
          setError("wrongPin");
          return false;
        }
      }
      // A hidden tab must never finish an in-flight unlock.
      if (document.visibilityState !== "visible") {
        setMode("unlock");
        setFirstPin("");
        return false;
      }
      if (!(await refreshWalletSession())) throw new Error("Session expired");
      if (document.visibilityState !== "visible") {
        setMode("unlock");
        setFirstPin("");
        return false;
      }
      setFirstPin("");
      markWelcomeEntered();
      setPrivacyUnlocked(true);
      if (location.pathname === "/welcome" || location.pathname === "/login")
        router.history.replace(next);
      return true;
    } catch {
      setError("unlockUnavailable");
      return false;
    }
  };

  useEffect(() => {
    const updateClock = () => setNow(new Date());
    updateClock();
    const interval = window.setInterval(updateClock, 1_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (phase !== "face-fail") return;
    const wait = window.setTimeout(
      () => router.history.replace(`/login?next=${encodeURIComponent(next)}`),
      FACE_ID_FAIL_MS,
    );
    return () => window.clearTimeout(wait);
  }, [phase, next, router]);

  return (
    <main lang="en" className="relative h-full min-h-0 w-full overflow-hidden bg-bg">
      {coverSrc ? (
        <img
          src={coverSrc}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 size-full object-cover object-[center_18%]"
          decoding="async"
          fetchPriority="high"
        />
      ) : (
        <div className="lf-welcome-fallback absolute inset-0" aria-hidden />
      )}
      <div
        className={
          phase === "pin"
            ? "pointer-events-none absolute inset-0 bg-[rgb(8_12_22_/_0.38)]"
            : "pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-black/25"
        }
        aria-hidden
      />
      {phase === "swipe" && now ? (
        <div
          className="lf-lock-clock pointer-events-none absolute inset-x-0 top-[max(3.1rem,calc(env(safe-area-inset-top)+1.4rem))] z-10 text-center text-white"
          aria-label={now.toLocaleString("en")}
        >
          <p className="lf-lock-clock-date">
            {new Intl.DateTimeFormat("en", {
              weekday: "long",
              month: "long",
              day: "numeric",
            }).format(now)}
          </p>
          <p className="lf-lock-clock-time">
            {new Intl.DateTimeFormat("en", {
              hour: "numeric",
              minute: "2-digit",
            }).format(now)}
          </p>
        </div>
      ) : null}
      {phase === "swipe" ? (
        <div className="absolute inset-x-0 bottom-[max(3.25rem,calc(env(safe-area-inset-bottom)+1.75rem))] z-10 flex justify-center px-7">
          <SwipeUnlock label={text.swipeUnlock} onUnlock={() => setPhase("checking")} />
        </div>
      ) : null}
      {phase === "face-fail" ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/35">
          <FaceIdFail label={text.faceFailed} />
        </div>
      ) : null}
      {phase === "pin" ? (
        <div className="lf-entry-content absolute inset-0 z-20 flex min-h-0 flex-col">
          <button
            className="min-h-11 shrink-0 self-end text-sm text-white/80"
            type="button"
            onClick={() => {
              void signOut("/welcome").catch(() => setError("signOutFailed"));
            }}
          >
            {text.signOut}
          </button>
          <PasscodePad
            key={mode}
            title={mode === "setup" ? text.setup : mode === "confirm" ? text.confirm : text.unlock}
            onComplete={completePin}
          />
          <p role="alert" className="min-h-12 shrink-0 text-center text-sm text-white">
            {errorText}
          </p>
        </div>
      ) : null}
      {phase === "checking" ? (
        <div
          role="status"
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/35 text-white"
        >
          {text.checking}
        </div>
      ) : null}
      {phase === "error" ? (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-black/50 text-white">
          <p role="alert">{errorText}</p>
          <button
            type="button"
            onClick={() => {
              setAttempt((n) => n + 1);
              setPhase("checking");
            }}
          >
            {text.retry}
          </button>
        </div>
      ) : null}
    </main>
  );
}
