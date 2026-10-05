import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { swipeProgress, swipeUnlocked } from "@/lib/welcome-entry";
import { cn } from "@/lib/utils";

const KNOB = 52;
const INSET = 2;

export function SwipeUnlock({ onUnlock }: { onUnlock: () => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    lastX: number;
    lastT: number;
    velocity: number;
    travel: number;
  } | null>(null);
  const [dx, setDx] = useState(0);
  const [armed, setArmed] = useState(false);
  const unlockedRef = useRef(false);
  const onUnlockRef = useRef(onUnlock);
  onUnlockRef.current = onUnlock;

  const travelFor = useCallback(() => {
    const track = trackRef.current;
    if (!track) return 0;
    return Math.max(0, track.clientWidth - KNOB - INSET * 2);
  }, []);

  const finish = useCallback((nextDx: number, velocity: number, travel: number) => {
    if (unlockedRef.current) return;
    if (swipeUnlocked(nextDx, travel, velocity)) {
      unlockedRef.current = true;
      setDx(travel);
      onUnlockRef.current();
      return;
    }
    setDx(0);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const onDown = (event: PointerEvent) => {
      if (unlockedRef.current) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const travel = Math.max(0, track.clientWidth - KNOB - INSET * 2);
      if (travel <= 0) return;
      event.preventDefault();
      try {
        track.setPointerCapture(event.pointerId);
      } catch {
        /* capture is best-effort; window listeners still finish the swipe */
      }
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        lastX: event.clientX,
        lastT: event.timeStamp,
        velocity: 0,
        travel,
      };
      setArmed(true);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    };

    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dt = Math.max(1, event.timeStamp - drag.lastT);
      drag.velocity = (event.clientX - drag.lastX) / dt;
      drag.lastX = event.clientX;
      drag.lastT = event.timeStamp;
      setDx(Math.min(drag.travel, Math.max(0, event.clientX - drag.startX)));
    };

    const onUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
      setArmed(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (track.hasPointerCapture(event.pointerId)) {
        track.releasePointerCapture(event.pointerId);
      }
      finish(Math.min(drag.travel, Math.max(0, event.clientX - drag.startX)), drag.velocity, drag.travel);
    };

    track.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      track.removeEventListener("pointerdown", onDown);
    };
  }, [finish]);

  const travel = travelFor();
  const progress = swipeProgress(dx, travel || 1);

  return (
    <div
      ref={trackRef}
      className={cn(
        "relative h-14 w-full max-w-[20.5rem] touch-none select-none rounded-full",
        "border border-white/25 bg-white/18 shadow-[inset_0_1px_0_rgb(255_255_255_/_0.28),0_10px_32px_rgb(0_0_0_/_0.35)]",
        "backdrop-blur-xl",
      )}
      role="slider"
      aria-label="Unlock"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      aria-orientation="horizontal"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " " || event.key === "ArrowRight") {
          event.preventDefault();
          const nextTravel = travelFor();
          finish(nextTravel, 1, nextTravel);
        }
      }}
    >
      <div
        className="pointer-events-none absolute top-[2px] bottom-[2px] left-[2px] rounded-full bg-white/10"
        style={{ width: KNOB + dx }}
        aria-hidden
      />
      <div
        className={cn(
          "pointer-events-none absolute top-[2px] left-[2px] flex size-[52px] items-center justify-center rounded-full bg-white text-[#1a1520]",
          "shadow-[0_8px_24px_rgb(0_0_0_/_0.35)]",
          !armed && "transition-transform duration-200 ease-out",
        )}
        style={{ transform: `translate3d(${dx}px, 0, 0)` }}
        aria-hidden
      >
        <ArrowRight className="size-7" strokeWidth={2.6} />
      </div>
    </div>
  );
}
