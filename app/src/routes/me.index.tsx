import { createFileRoute } from "@tanstack/react-router";
import { UserProfileScreen } from "@/components/user-profile-screen";

export const Route = createFileRoute("/me/")({
  component: MeProfilePage,
});

function MeProfilePage() {
  return <UserProfileScreen />;
}
