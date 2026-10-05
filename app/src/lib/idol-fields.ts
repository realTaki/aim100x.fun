import type { Idol, FlexibleScene } from "@/lib/idols";
export type { FlexibleScene };

function firstString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Read a string field from a bag, trying keys in order. */
export function fieldText(
  bag: Record<string, unknown> | undefined,
  ...keys: string[]
): string {
  if (!bag) return "";
  for (const key of keys) {
    const hit = firstString(bag[key]);
    if (hit) return hit;
  }
  return "";
}

export function idolName(idol: Idol): string {
  return idol.name.trim() || `#${idol.tokenId}`;
}

export function idolBio(idol: Idol): string {
  return idol.bio.trim();
}

export function idolPersonality(idol: Idol): string {
  return idol.personality.trim();
}

export function idolLook(idol: Idol): string {
  return idol.look.trim();
}

export function idolVoiceId(idol: Idol): string {
  return idol.voice.trim();
}

export function idolWebsite(idol: Idol): string {
  return idol.website.trim();
}

export function idolTwitter(idol: Idol): string {
  return idol.twitter.trim();
}

/** 欢迎词 — assistant line after subscribe, not scene opening. */
export function idolWelcome(idol: Idol): string {
  return idol.welcome.trim();
}

export function idolScenes(idol: Idol): FlexibleScene[] {
  return idol.scenes;
}

export function sceneAt(idol: Idol, index: number): FlexibleScene {
  const scenes = idolScenes(idol);
  return scenes[index] ?? scenes[0] ?? {};
}

export function sceneId(scene: FlexibleScene, fallback = "chat"): string {
  return fieldText(scene, "id", "sceneId") || fallback;
}

/** Chapter / topic line: `topic`, then heading/title used by older scene JSON. */
export function sceneTopic(scene: FlexibleScene): string {
  return fieldText(scene, "topic", "heading", "title", "label");
}

/** Setting text: `scene`, then theme/mood used by older scene JSON. */
export function sceneSetting(scene: FlexibleScene): string {
  return fieldText(scene, "scene", "theme", "mood");
}

export function sceneOpening(scene: FlexibleScene): string {
  return fieldText(scene, "opening", "intro");
}

export type SceneEntry = {
  id: string;
  topic: string;
  scene: string;
  opening: string;
};

export function sceneEntryOf(scene: FlexibleScene): SceneEntry {
  return {
    id: sceneId(scene, ""),
    topic: sceneTopic(scene),
    scene: sceneSetting(scene),
    opening: sceneOpening(scene),
  };
}

export function emptyScene(): FlexibleScene {
  return { id: "", topic: "", scene: "", opening: "" };
}

/** Overlay the four editor fields without dropping extras such as choices. */
export function applySceneEntry(scene: FlexibleScene, entry: SceneEntry): FlexibleScene {
  return {
    ...scene,
    id: entry.id.trim(),
    topic: entry.topic,
    scene: entry.scene,
    opening: entry.opening,
  };
}

export function sceneChoices(scene: FlexibleScene): string[] {
  const raw = scene.choices ?? scene["选项"];
  if (!Array.isArray(raw)) return [];
  return raw.filter((c): c is string => typeof c === "string");
}

export function sceneFieldText(scene: FlexibleScene, ...keys: string[]): string {
  return fieldText(scene, ...keys);
}

export function idolSearchText(idol: Idol): string {
  return [idolName(idol), idol.bio, idol.personality, idol.look, String(idol.tokenId)]
    .join(" ")
    .toLowerCase();
}

export function parseScenesJson(raw: string): FlexibleScene[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) return [];
    const scenes: FlexibleScene[] = [];
    for (const item of parsed) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        scenes.push(item as FlexibleScene);
      }
    }
    return scenes;
  } catch {
    return [];
  }
}

export function scenesJsonOf(idol: Idol): string {
  return JSON.stringify(idol.scenes);
}
