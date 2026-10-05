import { createFileRoute } from "@tanstack/react-router";
import { SubscribedScreen } from "@/components/subscribed-screen";

export const Route = createFileRoute("/subscribed")({
  component: SubscribedPage,
});

function SubscribedPage() {
  return <SubscribedScreen />;
}
