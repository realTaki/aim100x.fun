import { createFileRoute } from "@tanstack/react-router";
import { ManagerIdolEditScreen } from "@/components/manager-idol-edit-screen";
import { parseTokenIdParam } from "@/lib/token-id";

export const Route = createFileRoute("/me/manager/$tokenId")({
  component: ManagerIdolEditPage,
});

function ManagerIdolEditPage() {
  const { tokenId: raw } = Route.useParams();
  const tokenId = parseTokenIdParam(raw);
  return <ManagerIdolEditScreen tokenId={tokenId} />;
}
