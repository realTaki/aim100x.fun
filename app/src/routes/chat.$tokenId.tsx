import { createFileRoute, Navigate } from "@tanstack/react-router";
import { ChatScreen } from "@/components/chat-screen";
import { getChatIdol } from "@/lib/idol-catalog";
import { parseTokenIdParam } from "@/lib/token-id";

export const Route = createFileRoute("/chat/$tokenId")({
  loader: async ({ params }) => {
    const tokenId = parseTokenIdParam(params.tokenId);
    if (!tokenId) return { idol: null };
    return { idol: await getChatIdol({ data: { tokenId } }).catch(() => null) };
  },
  staleTime: 0,
  shouldReload: true,
  component: ChatPage,
});

function ChatPage() {
  const { idol } = Route.useLoaderData();
  if (!idol) return <Navigate to="/" />;
  return <ChatScreen key={idol.tokenId} creator={idol} />;
}
