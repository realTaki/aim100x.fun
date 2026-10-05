import { createFileRoute } from "@tanstack/react-router";
import { WelcomeSplash } from "@/components/welcome-splash";
import { listPlazaIdols } from "@/lib/idol-catalog";
import { pickWelcomeCover, welcomeCoverPool } from "@/lib/welcome-entry";

export const Route = createFileRoute("/welcome")({
  staleTime: 0,
  preloadStaleTime: 0,
  gcTime: 0,
  shouldReload: true,
  loader: async () => {
    try {
      const idols = await listPlazaIdols();
      return { coverSrc: pickWelcomeCover(welcomeCoverPool(idols)) };
    } catch {
      return { coverSrc: "" };
    }
  },
  component: WelcomePage,
});

function WelcomePage() {
  const { coverSrc } = Route.useLoaderData();
  return <WelcomeSplash coverSrc={coverSrc} />;
}
