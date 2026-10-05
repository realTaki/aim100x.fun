import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/me/manager")({
  component: ManagerLayout,
});

function ManagerLayout() {
  return <Outlet />;
}
