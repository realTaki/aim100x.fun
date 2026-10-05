import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { ChevronLeft } from "lucide-react";
import { LfLogo } from "@/components/lf-logo";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { PasskeySignIn } from "@/lib/auth/passkey-sign-in";

function safeNext(raw: unknown) {
  if (typeof raw !== "string") return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}

export const Route = createFileRoute("/login")({
  validateSearch: (raw: Record<string, unknown>) => ({ next: safeNext(raw.next) }),
  component: Login,
});

function Login() {
  const { next } = Route.useSearch();
  const { user, isPending } = useCurrentUserState();
  const router = useRouter();

  useEffect(() => {
    if (isPending || !user) return;
    router.history.replace(next);
  }, [isPending, next, router, user]);

  return (
    <main className="relative flex h-full min-h-0 flex-col items-center justify-center overflow-hidden px-6">
      <Link
        to="/"
        className="absolute top-[max(0.75rem,env(safe-area-inset-top))] left-3 z-20 flex size-10 items-center justify-center rounded-full border border-white/10 bg-bg/50 text-fg backdrop-blur-md"
        aria-label="Back"
      >
        <ChevronLeft className="size-7" strokeWidth={2} />
      </Link>
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/4 left-1/2 size-64 -translate-x-1/2 rounded-full bg-accent/25 blur-3xl"
      />
      <LfLogo className="relative size-20" />
      {isPending || user ? (
        <div className="mt-8 size-10 animate-pulse rounded-full bg-surface-2" />
      ) : (
        <PasskeySignIn callbackURL={next} />
      )}
    </main>
  );
}
