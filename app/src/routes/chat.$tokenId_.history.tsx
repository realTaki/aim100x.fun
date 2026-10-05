import { createFileRoute, Navigate } from "@tanstack/react-router";
import { HistoryScreen } from "@/components/history-screen";
import { getCatalogIdol } from "@/lib/idol-catalog";
import { parseTokenIdParam } from "@/lib/token-id";

export const Route = createFileRoute("/chat/$tokenId_/history")({
  loader: async ({ params }) => {
    const tokenId = parseTokenIdParam(params.tokenId);
    if (!tokenId) return { idol: null };
    return { idol: await getCatalogIdol({ data: { tokenId } }) };
  },
  component: HistoryPage,
});

function HistoryPage() {
  const { idol } = Route.useLoaderData();
  if (!idol) return <Navigate to="/" />;
  return <HistoryScreen creator={idol} />;
}
