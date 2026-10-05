import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/me")({
  component: MeLayout,
});

function MeLayout() {
  return <Outlet />;
}
