import { createFileRoute } from "@tanstack/react-router";
import { DiscoverScreen } from "@/components/discover-screen";
import { listPlazaIdols } from "@/lib/idol-catalog";

export const Route = createFileRoute("/")({
  loader: () => listPlazaIdols(),
  component: DiscoverPage,
});

function DiscoverPage() {
  const idols = Route.useLoaderData();
  return <DiscoverScreen idols={idols} />;
}
