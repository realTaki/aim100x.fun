import type { ChatMsg, ChatThread } from "@/lib/thread";

export type ChatStoreRequest =
  | { id: number; type: "init" }
  | { id: number; type: "getThread"; userId: string; tokenKey: string }
  | { id: number; type: "setThread"; userId: string; tokenKey: string; thread: ChatThread }
  | {
      id: number;
      type: "appendMessages";
      userId: string;
      tokenKey: string;
      messages: ChatMsg[];
      meta: ChatThreadMetaPatch;
    }
  | { id: number; type: "search"; userId: string; tokenKey: string; query: string };

export type ChatThreadMetaPatch = {
  chapter: number;
  sceneId: string;
  sceneImages: number;
  choicesByChapter: Record<number, string[]>;
  usedImageIds?: string[];
  photoUrls?: string[];
  locale?: string;
  localizedOpening?: string;
  localizedHeading?: string;
  generation?: number;
};

export type ChatStoreResponse =
  | { id: number; ok: true; thread?: ChatThread | null; messageIds?: string[] }
  | { id: number; ok: false; error: string };
