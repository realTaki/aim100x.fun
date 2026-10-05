import { useEffect, useRef, useState } from "react";
import {
  appendPinDigit,
  pinEntryStatus,
  WELCOME_PIN_LENGTH,
} from "@/lib/welcome-entry";
import { cn } from "@/lib/utils";

const KEYS: { digit: string; letters?: string }[][] = [
  [
    { digit: "1" },
    { digit: "2", letters: "ABC" },
    { digit: "3", letters: "DEF" },
  ],
  [
    { digit: "4", letters: "GHI" },
    { digit: "5", letters: "JKL" },
    { digit: "6", letters: "MNO" },
  ],
  [
    { digit: "7", letters: "PQRS" },
    { digit: "8", letters: "TUV" },
    { digit: "9", letters: "WXYZ" },
  ],
];

export function PasscodePad({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState("");
  const [shaking, setShaking] = useState(false);
  const unlockedRef = useRef(false);
  const onUnlockRef = useRef(onUnlock);
  onUnlockRef.current = onUnlock;

  const applyDigit = (digit: string) => {
    if (shaking || unlockedRef.current) return;
    setPin((current) => {
      const next = appendPinDigit(current, digit);
      if (pinEntryStatus(next) === "ok") {
        unlockedRef.current = true;
        queueMicrotask(() => onUnlockRef.current());
      }
      return next;
    });
  };

  useEffect(() => {
    if (pinEntryStatus(pin) !== "wrong") return;
    setShaking(true);
    const hold = window.setTimeout(() => {
      setPin("");
      setShaking(false);
    }, 520);
    return () => window.clearTimeout(hold);
  }, [pin]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Backspace") {
        event.preventDefault();
        if (shaking) return;
        setPin((current) => current.slice(0, -1));
        return;
      }
      if (/^\d$/.test(event.key)) applyDigit(event.key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shaking]);

  return (
    <div className="lf-pin-pad relative flex h-full min-h-0 w-full flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-12">
        <div
          className={cn("flex items-center gap-[18px]", shaking && "lf-pin-shake")}
          aria-label={`${pin.length} of ${WELCOME_PIN_LENGTH} digits`}
        >
          {Array.from({ length: WELCOME_PIN_LENGTH }, (_, i) => (
            <span
              key={i}
              className={cn(
                "size-[13px] rounded-full border-[1.5px] border-white",
                i < pin.length && "bg-white",
              )}
              aria-hidden
            />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-x-[1.4rem] gap-y-[0.9rem]">
          {KEYS.flat().map((key) => (
            <PadKey
              key={key.digit}
              digit={key.digit}
              letters={key.letters}
              onPress={() => applyDigit(key.digit)}
            />
          ))}
          <span aria-hidden />
          <PadKey digit="0" center onPress={() => applyDigit("0")} />
          <span aria-hidden />
        </div>
      </div>
    </div>
  );
}

function PadKey({
  digit,
  letters,
  center,
  onPress,
}: {
  digit: string;
  letters?: string;
  center?: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="lf-pin-key outline-none"
      aria-label={digit}
    >
      <span className="lf-pin-key-digit">{digit}</span>
      {letters ? (
        <span className="lf-pin-key-letters">{letters}</span>
      ) : center ? null : (
        <span className="lf-pin-key-letters" aria-hidden>
          {"\u00a0"}
        </span>
      )}
    </button>
  );
}
