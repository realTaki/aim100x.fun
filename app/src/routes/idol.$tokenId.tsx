import { createFileRoute, Navigate } from "@tanstack/react-router";
import { ProfileScreen } from "@/components/profile-screen";
import { getCatalogIdol } from "@/lib/idol-catalog";
import { parseTokenIdParam } from "@/lib/token-id";

export const Route = createFileRoute("/idol/$tokenId")({
  validateSearch: (raw: Record<string, unknown>) => ({
    needFan: raw.needFan === "1" || raw.needFan === true,
    becomeFan: raw.becomeFan === "1" || raw.becomeFan === true,
  }),
  loader: async ({ params }) => {
    const tokenId = parseTokenIdParam(params.tokenId);
    if (!tokenId) return { idol: null };
    return { idol: await getCatalogIdol({ data: { tokenId } }) };
  },
  component: ProfilePage,
});

function ProfilePage() {
  const { idol } = Route.useLoaderData();
  if (!idol) return <Navigate to="/" />;
  return <ProfileScreen creator={idol} />;
}
