import { createFileRoute } from "@tanstack/react-router";
import { PrivacyEntry } from "@/components/privacy-gate";
import { safePrivacyNext } from "@/lib/privacy-pin";

export const Route = createFileRoute("/welcome")({
  validateSearch: (raw: Record<string, unknown>) => ({
    pin: raw.pin === true || raw.pin === "1" || raw.pin === 1,
    next: safePrivacyNext(raw.next),
  }),
  component: WelcomePage,
});
function WelcomePage() {
  const { pin, next } = Route.useSearch();
  return <PrivacyEntry next={next} autoCheck={pin} />;
}
