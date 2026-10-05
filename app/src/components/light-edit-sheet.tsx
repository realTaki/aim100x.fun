import { useEffect } from "react";
import { ActionGlyphButton } from "@/components/action-glyph-button";
import { AppFrameOverlay, AppPageShell } from "@/components/app-page-shell";
import { useActionGlyph } from "@/lib/use-action-glyph";

type LightEditSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  title?: string;
  onSave?: () => void | Promise<void>;
  saveLabel?: string;
  saveDisabled?: boolean;
  closeOnSuccess?: boolean;
  className?: string;
};

export function LightEditSheet({
  open,
  onOpenChange,
  children,
  title = "",
  onSave,
  saveLabel = "保存",
  saveDisabled,
  closeOnSuccess = false,
  className,
}: LightEditSheetProps) {
  const action = useActionGlyph();
  const reset = action.reset;

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  return (
    <AppFrameOverlay open={open} onOpenChange={onOpenChange}>
      <AppPageShell
        title={title}
        onBack={() => onOpenChange(false)}
        bodyClassName={className}
        footer={
          onSave ? (
            <div className="shrink-0 border-t border-border/70 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <ActionGlyphButton
                status={action.status}
                disabled={saveDisabled}
                idleLabel={saveLabel}
                pendingLabel="保存中…"
                onClick={() => {
                  void action.run(async () => {
                    await onSave();
                  }).then((result) => {
                    if (closeOnSuccess && (result === "idle" || result === "done")) {
                      onOpenChange(false);
                    }
                  });
                }}
                className="flex h-11 w-full items-center justify-center rounded-full bg-accent text-sm font-medium text-fg shadow-[0_8px_24px_rgb(192_38_255_/_0.28)] transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
              >
                {saveLabel}
              </ActionGlyphButton>
            </div>
          ) : undefined
        }
      >
        {children}
      </AppPageShell>
    </AppFrameOverlay>
  );
}
