import { useCallback, useRef, useState } from "react";
import { pushActionError } from "@/lib/action-error";
import {
  isActionGlyphBusy,
  runActionGlyph,
  type ActionGlyph,
} from "@/lib/action-glyph";

export function useActionGlyph(opts?: { afterSuccess?: "idle" | "done" }) {
  const [status, setStatus] = useState<ActionGlyph>("idle");
  const gen = useRef(0);
  const inFlight = useRef(false);
  const afterSuccess = opts?.afterSuccess ?? "idle";

  const run = useCallback(
    async (work: () => Promise<void>) => {
      if (inFlight.current || isActionGlyphBusy(status)) return status;
      inFlight.current = true;
      const token = ++gen.current;
      try {
        return await runActionGlyph(work, setStatus, {
          afterSuccess,
          isCurrent: () => token === gen.current,
          onError: pushActionError,
        });
      } finally {
        inFlight.current = false;
      }
    },
    [afterSuccess, status],
  );

  const reset = useCallback(() => {
    gen.current += 1;
    inFlight.current = false;
    setStatus("idle");
  }, []);

  return { status, run, reset };
}

export type { ActionGlyph };
