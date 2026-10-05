import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { FaceIdFail } from "@/components/face-id-fail";
import { PasscodePad } from "@/components/passcode-pad";
import { SwipeUnlock } from "@/components/swipe-unlock";
import { FACE_ID_FAIL_MS, markWelcomeEntered, PLAZA_PATH } from "@/lib/welcome-entry";

type Phase = "swipe" | "face-fail" | "pin";

export function WelcomeSplash({ coverSrc }: { coverSrc: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("swipe");

  useEffect(() => {
    if (phase !== "face-fail") return;
    const wait = window.setTimeout(() => setPhase("pin"), FACE_ID_FAIL_MS);
    return () => window.clearTimeout(wait);
  }, [phase]);

  return (
    <main className="relative h-full min-h-0 w-full overflow-hidden bg-bg">
      {coverSrc ? (
        <img
          src={coverSrc}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 size-full object-cover object-[center_18%]"
          decoding="async"
          fetchPriority="high"
        />
      ) : (
        <div className="lf-welcome-fallback absolute inset-0" aria-hidden />
      )}
      <div
        className={
          phase === "pin"
            ? "pointer-events-none absolute inset-0 bg-[rgb(8_12_22_/_0.38)]"
            : "pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-black/25"
        }
        aria-hidden
      />
      {phase === "swipe" ? (
        <div className="absolute inset-x-0 bottom-[max(3.25rem,calc(env(safe-area-inset-bottom)+1.75rem))] z-10 flex justify-center px-7">
          <SwipeUnlock onUnlock={() => setPhase("face-fail")} />
        </div>
      ) : null}
      {phase === "face-fail" ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/35">
          <FaceIdFail />
        </div>
      ) : null}
      {phase === "pin" ? (
        <div className="absolute inset-0 z-20">
          <PasscodePad
            onUnlock={() => {
              markWelcomeEntered();
              void router.navigate({ to: PLAZA_PATH });
            }}
          />
        </div>
      ) : null}
    </main>
  );
}
