import { useEffect, useRef, useState } from "react";
import { Pencil, Save } from "lucide-react";
import { ActionGlyphButton } from "@/components/action-glyph-button";
import { useActionGlyph } from "@/lib/use-action-glyph";
import { cn } from "@/lib/utils";

export function InlineFieldEditor({
  canEdit,
  saved,
  multiline,
  maxLength,
  label,
  className,
  onSave,
}: {
  canEdit: boolean;
  saved: string;
  multiline?: boolean;
  maxLength: number;
  label: string;
  className?: string;
  onSave: (next: string) => Promise<void>;
}) {
  const action = useActionGlyph();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(saved);
  const fieldRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const glyph = editing ? action.status : "idle";

  useEffect(() => {
    if (!editing) setDraft(saved);
  }, [saved, editing]);

  useEffect(() => {
    if (!editing || glyph !== "idle") return;
    fieldRef.current?.focus();
  }, [editing, glyph]);

  if (!canEdit) {
    return <div className={className}>{saved || "\u00a0"}</div>;
  }

  async function commit() {
    const next = draft.trim();
    if (next === saved.trim()) {
      setEditing(false);
      return;
    }
    const result = await action.run(() => onSave(next));
    if (result === "idle" || result === "done") {
      setDraft(next);
      setEditing(false);
    }
  }

  const shown = saved || "\u00a0";
  const pending = glyph === "pending";

  return (
    <div
      className={cn(
        "relative",
        editing && "rounded-md outline outline-1 outline-accent/55 outline-offset-2",
      )}
    >
      <div className={cn(className, "min-h-[1.5em]", editing && "invisible")} aria-hidden={editing}>
        {shown}
      </div>
      {editing ? (
        multiline ? (
          <textarea
            ref={(el) => {
              fieldRef.current = el;
            }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false);
            }}
            maxLength={maxLength}
            disabled={pending || glyph === "success"}
            aria-label={label}
            className={cn(
              className,
              "absolute inset-0 size-full resize-none overflow-auto bg-transparent outline-none",
            )}
          />
        ) : (
          <input
            ref={(el) => {
              fieldRef.current = el;
            }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void commit();
              }
              if (e.key === "Escape") setEditing(false);
            }}
            maxLength={maxLength}
            disabled={pending || glyph === "success"}
            aria-label={label}
            className={cn(className, "absolute inset-0 size-full bg-transparent outline-none")}
          />
        )
      ) : null}
      <ActionGlyphButton
        status={glyph}
        iconClassName="size-3.5"
        idleLabel={editing ? "Save" : `Edit ${label}`}
        pendingLabel="Saving"
        successLabel="Saved"
        errorLabel="Could not save"
        onClick={() => {
          if (!editing) {
            setDraft(saved);
            setEditing(true);
            return;
          }
          void commit();
        }}
        className="absolute top-0 right-0 z-10 flex size-8 items-center justify-center rounded-full border border-white/15 bg-bg/70 text-fg shadow-md backdrop-blur-md"
      >
        {editing ? (
          <Save className="size-3.5" strokeWidth={2.25} />
        ) : (
          <Pencil className="size-3.5" strokeWidth={2.25} />
        )}
      </ActionGlyphButton>
    </div>
  );
}
