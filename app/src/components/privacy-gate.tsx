import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { WelcomeSplash } from "./welcome-splash";
import { isPrivacyUnlocked, setPrivacyUnlocked, subscribePrivacyLock } from "@/lib/privacy-pin";
import { listPlazaIdols } from "@/lib/idol-catalog";
import { pickWelcomeCover, welcomeCoverPool } from "@/lib/welcome-entry";

export function PrivacyEntry({
  next = "/",
  autoCheck = false,
}: {
  next?: string;
  autoCheck?: boolean;
}) {
  const [coverSrc, setCoverSrc] = useState("");
  useEffect(() => {
    let cancelled = false;
    void listPlazaIdols()
      .then((idols) => {
        if (!cancelled) setCoverSrc(pickWelcomeCover(welcomeCoverPool(idols)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return <WelcomeSplash coverSrc={coverSrc} next={next} autoCheck={autoCheck} />;
}

export function PrivacyGate({ children }: { children: ReactNode }) {
  const unlocked = useSyncExternalStore(subscribePrivacyLock, isPrivacyUnlocked, () => false);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const next = useRouterState({ select: (s) => s.location.href });
  useEffect(() => {
    if (!unlocked) return;
    let timer: number;
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setPrivacyUnlocked(false), 60_000);
    };
    const events = ["pointerdown", "pointermove", "keydown", "scroll"] as const;
    events.forEach((event) => window.addEventListener(event, reset, { passive: true }));
    reset();
    return () => {
      window.clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, reset));
    };
  }, [unlocked]);
  useEffect(() => {
    const lock = () => setPrivacyUnlocked(false);
    const visibility = () => {
      if (document.visibilityState === "hidden") lock();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", lock);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", lock);
    };
  }, []);
  if (path === "/welcome" || path === "/login") return children;
  return unlocked ? (
    children
  ) : (
    <PrivacyEntry next={next.startsWith("/") && !next.startsWith("//") ? next : path} />
  );
}
