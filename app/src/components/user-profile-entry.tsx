import { Link } from "@tanstack/react-router";
import { User } from "lucide-react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useUserProfile } from "@/lib/user-profile/use-user-profile";
import { UserProfileAvatar } from "@/components/user-profile-avatar";

const ME_PATH = "/me";

export function UserProfileEntry() {
  const { user, isPending } = useCurrentUserState();

  if (isPending) {
    return (
      <div
        className="size-9 animate-pulse rounded-full bg-surface-2 ring-1 ring-border"
        aria-hidden
      />
    );
  }

  if (!user) {
    return (
      <Link
        to="/login"
        search={{ next: ME_PATH }}
        className="flex size-9 items-center justify-center rounded-full border border-border/80 bg-surface-2/90 text-muted transition-colors hover:border-accent/40 hover:text-fg"
        aria-label="Sign in to your profile"
        title="Your profile"
      >
        <User className="size-4" strokeWidth={2} />
      </Link>
    );
  }

  return <SignedInProfileEntry user={user} />;
}

function SignedInProfileEntry({
  user,
}: {
  user: NonNullable<ReturnType<typeof useCurrentUserState>["user"]>;
}) {
  const { avatarUrl } = useUserProfile(user);
  if (!avatarUrl) return null;

  return (
    <Link
      to={ME_PATH}
      className="rounded-full transition-opacity hover:opacity-90 active:scale-[0.97]"
      aria-label="Your profile"
      title="Your profile"
    >
      <UserProfileAvatar src={avatarUrl} />
    </Link>
  );
}
