import { useActionGlyph } from "@/lib/use-action-glyph";
import { shortPayError } from "@/lib/subscribe/pay-error";

export function usePayAction() {
  const action = useActionGlyph({ afterSuccess: "done" });
  return {
    ...action,
    run: (work: () => Promise<void>) =>
      action.run(async () => {
        try {
          await work();
        } catch (err) {
          throw new Error(shortPayError(err));
        }
      }),
  };
}

export type { ActionGlyph as PayActionStatus } from "@/lib/action-glyph";
