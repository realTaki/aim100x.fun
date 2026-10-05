import { createFileRoute } from "@tanstack/react-router";
import { AgentAccountScreen } from "@/components/agent-account-screen";

export const Route = createFileRoute("/me/manager/agent")({
  component: AgentAccountPage,
});

function AgentAccountPage() {
  return <AgentAccountScreen />;
}
