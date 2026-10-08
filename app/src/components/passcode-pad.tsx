import { WELCOME_COPY } from "@/lib/welcome-copy";
import { useEffect, useRef, useState } from "react";
import { appendPinDigit, WELCOME_PIN_LENGTH } from "@/lib/welcome-entry";
import { cn } from "@/lib/utils";

const KEYS: { digit: string; letters?: string }[][] = [
  [{ digit: "1" }, { digit: "2", letters: "ABC" }, { digit: "3", letters: "DEF" }],
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

export function PasscodePad({
  title,
  onComplete,
}: {
  title: string;
  onComplete: (pin: string) => Promise<boolean>;
}) {
  const text = WELCOME_COPY;
  const [pin, setPin] = useState("");
  const [shaking, setShaking] = useState(false);
  const [busy, setBusy] = useState(false);
  const pinRef = useRef("");
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const resetTimer = useRef<number | undefined>(undefined);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      window.clearTimeout(resetTimer.current);
    };
  }, []);

  const erase = () => {
    if (busyRef.current) return;
    pinRef.current = pinRef.current.slice(0, -1);
    setPin(pinRef.current);
  };
  const applyDigit = (digit: string) => {
    if (busyRef.current) return;
    const next = appendPinDigit(pinRef.current, digit);
    pinRef.current = next;
    setPin(next);
    if (next.length !== WELCOME_PIN_LENGTH) return;
    busyRef.current = true;
    setBusy(true);
    void onCompleteRef
      .current(next)
      .catch(() => false)
      .then((accepted) => {
        if (!mounted.current || accepted) return;
        setShaking(true);
        resetTimer.current = window.setTimeout(() => {
          pinRef.current = "";
          setPin("");
          setShaking(false);
          setBusy(false);
          busyRef.current = false;
        }, 520);
      });
  };
  const applyDigitRef = useRef(applyDigit);
  applyDigitRef.current = applyDigit;
  const eraseRef = useRef(erase);
  eraseRef.current = erase;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Backspace") {
        event.preventDefault();
        eraseRef.current();
      } else if (/^\d$/.test(event.key)) {
        event.preventDefault();
        applyDigitRef.current(event.key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="lf-pin-pad relative flex min-h-0 w-full flex-1 flex-col items-center overflow-y-auto overscroll-contain py-6">
      <div className="my-auto flex shrink-0 flex-col items-center gap-8">
        <h1 className="text-center text-lg text-white" aria-live="polite">
          {title}
        </h1>
        <div
          className={cn("flex items-center gap-[18px]", shaking && "lf-pin-shake")}
          role="status"
          aria-label={text.progress(pin.length, WELCOME_PIN_LENGTH)}
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
              disabled={busy}
              onPress={() => applyDigit(key.digit)}
            />
          ))}
          <span aria-hidden />
          <PadKey digit="0" center disabled={busy} onPress={() => applyDigit("0")} />
          <button
            type="button"
            onClick={erase}
            disabled={busy}
            className="text-white/80 disabled:opacity-40"
            aria-label={text.deleteDigit}
          >
            {text.delete}
          </button>
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
  disabled,
}: {
  digit: string;
  letters?: string;
  center?: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
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
