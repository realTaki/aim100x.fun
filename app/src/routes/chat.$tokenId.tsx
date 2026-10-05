import { createFileRoute, Navigate } from "@tanstack/react-router";
import { ChatScreen } from "@/components/chat-screen";
import { getCatalogIdol } from "@/lib/idol-catalog";
import { parseTokenIdParam } from "@/lib/token-id";

export const Route = createFileRoute("/chat/$tokenId")({
  loader: async ({ params }) => {
    const tokenId = parseTokenIdParam(params.tokenId);
    if (!tokenId) return { idol: null };
    return { idol: await getCatalogIdol({ data: { tokenId } }) };
  },
  staleTime: 10 * 60_000,
  shouldReload: false,
  component: ChatPage,
});

function ChatPage() {
  const { idol } = Route.useLoaderData();
  if (!idol) return <Navigate to="/" />;
  return <ChatScreen key={idol.tokenId} creator={idol} />;
}
