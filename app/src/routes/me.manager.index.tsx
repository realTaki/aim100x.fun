import { createFileRoute } from "@tanstack/react-router";
import { ManagerCenterScreen } from "@/components/manager-center-screen";

export const Route = createFileRoute("/me/manager/")({
  component: ManagerCenterPage,
});

function ManagerCenterPage() {
  return <ManagerCenterScreen />;
}
