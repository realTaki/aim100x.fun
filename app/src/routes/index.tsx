import { createFileRoute, redirect } from "@tanstack/react-router";
import { DiscoverScreen } from "@/components/discover-screen";
import { listPlazaIdols } from "@/lib/idol-catalog";
import { readWelcomeEntered } from "@/lib/welcome-gate";
import {
  hasWelcomeEntered,
  shouldRedirectRootToWelcome,
  WELCOME_PATH,
} from "@/lib/welcome-entry";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const entered =
      typeof document !== "undefined" ? hasWelcomeEntered() : await readWelcomeEntered();
    if (shouldRedirectRootToWelcome(entered)) {
      throw redirect({ to: WELCOME_PATH });
    }
  },
  loader: () => listPlazaIdols(),
  component: DiscoverPage,
});

function DiscoverPage() {
  const idols = Route.useLoaderData();
  return <DiscoverScreen idols={idols} />;
}
