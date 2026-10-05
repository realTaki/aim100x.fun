import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  applySceneEntry,
  emptyScene,
  sceneEntryOf,
  type SceneEntry,
} from "@/lib/idol-fields";
import type { FlexibleScene } from "@/lib/idols";
import { uid } from "@/lib/utils";

const FIELDS: { key: keyof SceneEntry; multiline?: boolean }[] = [
  { key: "id" },
  { key: "topic" },
  { key: "scene", multiline: true },
  { key: "opening", multiline: true },
];

function padKeys(count: number, prev: string[]): string[] {
  const next = prev.slice(0, count);
  while (next.length < count) next.push(uid());
  return next;
}

export function ManagerSceneList({
  scenes,
  onChange,
  disabled,
}: {
  scenes: FlexibleScene[];
  onChange: (scenes: FlexibleScene[]) => void;
  disabled?: boolean;
}) {
  const [keys, setKeys] = useState(() => padKeys(scenes.length, []));

  useEffect(() => {
    setKeys((prev) => padKeys(scenes.length, prev));
  }, [scenes.length]);

  function patch(index: number, field: keyof SceneEntry, value: string) {
    onChange(
      scenes.map((scene, i) =>
        i === index
          ? applySceneEntry(scene, { ...sceneEntryOf(scene), [field]: value })
          : scene,
      ),
    );
  }

  function addScene() {
    setKeys((prev) => [...prev, uid()]);
    onChange([...scenes, emptyScene()]);
  }

  function removeScene(index: number) {
    setKeys((prev) => prev.filter((_, i) => i !== index));
    onChange(scenes.filter((_, i) => i !== index));
  }

  return (
    <section className="mt-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted">场景</span>
        {disabled ? null : (
          <button
            type="button"
            onClick={addScene}
            className="inline-flex items-center gap-1 rounded-full border border-accent/50 px-3 py-1 text-xs font-medium text-accent"
          >
            <Plus className="size-3.5" strokeWidth={2} />
            添加
          </button>
        )}
      </div>
      <ul className="mt-2 flex flex-col gap-3">
        {scenes.map((scene, index) => {
          const entry = sceneEntryOf(scene);
          return (
            <li
              key={keys[index] ?? `scene-${index}`}
              className="rounded-2xl border border-border/70 bg-surface-2/60 px-3 py-3"
            >
              <div className="flex flex-col gap-2.5">
                {FIELDS.map((field) => {
                  const value = entry[field.key];
                  const label = field.key;
                  return (
                    <label key={field.key} className="block">
                      <span className="text-xs text-muted">{label}</span>
                      {field.multiline ? (
                        <textarea
                          value={value}
                          onChange={(e) => patch(index, field.key, e.target.value)}
                          rows={field.key === "opening" ? 3 : 2}
                          disabled={disabled}
                          aria-label={label}
                          className="lf-search mt-1 min-h-[4rem] resize-none py-3 text-sm leading-relaxed"
                        />
                      ) : (
                        <input
                          value={value}
                          onChange={(e) => patch(index, field.key, e.target.value)}
                          disabled={disabled}
                          aria-label={label}
                          spellCheck={field.key !== "id"}
                          className="lf-search mt-1 py-3 text-sm"
                        />
                      )}
                    </label>
                  );
                })}
              </div>
              {disabled ? null : (
                <button
                  type="button"
                  onClick={() => removeScene(index)}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs text-red-300"
                >
                  <Trash2 className="size-3.5" />
                  删除
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
