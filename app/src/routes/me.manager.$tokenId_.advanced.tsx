import { createFileRoute } from "@tanstack/react-router";
import { ManagerIdolAdvancedScreen } from "@/components/manager-idol-advanced-screen";
import { parseTokenIdParam } from "@/lib/token-id";

export const Route = createFileRoute("/me/manager/$tokenId_/advanced")({
  component: ManagerIdolAdvancedPage,
});

function ManagerIdolAdvancedPage() {
  const { tokenId: raw } = Route.useParams();
  const tokenId = parseTokenIdParam(raw);
  return <ManagerIdolAdvancedScreen tokenId={tokenId} />;
}
