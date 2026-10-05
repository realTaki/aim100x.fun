import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Idol } from "./idols.ts";
import {
  applySceneEntry,
  emptyScene,
  idolWelcome,
  sceneEntryOf,
  sceneId,
  sceneOpening,
  sceneSetting,
  sceneTopic,
} from "./idol-fields.ts";

describe("sceneEntryOf", () => {
  it("reads id / topic / scene / opening from current keys", () => {
    assert.deepEqual(
      sceneEntryOf({
        id: "late-night",
        topic: "深夜私信",
        scene: "卧室灯还亮着。",
        opening: "嘿，这么晚还不睡？是不是想我了。",
      }),
      {
        id: "late-night",
        topic: "深夜私信",
        scene: "卧室灯还亮着。",
        opening: "嘿，这么晚还不睡？是不是想我了。",
      },
    );
  });

  it("fills the four fields from older heading / title / theme JSON", () => {
    assert.deepEqual(
      sceneEntryOf({
        id: "late-night",
        heading: "第 01 章 · 深夜私信",
        title: "第 01 章",
        theme: "深夜卧室，暧昧灯光，刚洗完澡。",
        opening: "嘿，这么晚还不睡？是不是想我了。",
        choices: ["没啥，随便看看", "想你了嘛"],
      }),
      {
        id: "late-night",
        topic: "第 01 章 · 深夜私信",
        scene: "深夜卧室，暧昧灯光，刚洗完澡。",
        opening: "嘿，这么晚还不睡？是不是想我了。",
      },
    );
  });
});

describe("applySceneEntry", () => {
  it("writes the four fields and keeps extra keys", () => {
    const next = applySceneEntry(
      {
        id: "late-night",
        heading: "第 01 章 · 深夜私信",
        choices: ["没啥，随便看看"],
      },
      {
        id: "late-night",
        topic: "深夜",
        scene: "卧室",
        opening: "嘿，这么晚还不睡？是不是想我了。",
      },
    );
    assert.equal(sceneId(next), "late-night");
    assert.equal(sceneTopic(next), "深夜");
    assert.equal(sceneSetting(next), "卧室");
    assert.equal(sceneOpening(next), "嘿，这么晚还不睡？是不是想我了。");
    assert.deepEqual(next.choices, ["没啥，随便看看"]);
    assert.equal(next.heading, "第 01 章 · 深夜私信");
  });

  it("starts a blank row with the four fields", () => {
    assert.deepEqual(emptyScene(), { id: "", topic: "", scene: "", opening: "" });
  });
});

describe("idolWelcome", () => {
  it("reads 欢迎词 from the idol, not from scene opening", () => {
    const scene = {
      id: "late-night",
      opening: "嘿，这么晚还不睡？是不是想我了。",
    };
    const idol = { welcome: "  感谢你订阅我  ", scenes: [scene] } as unknown as Idol;
    assert.equal(idolWelcome(idol), "感谢你订阅我");
    assert.equal(sceneOpening(scene), "嘿，这么晚还不睡？是不是想我了。");
    assert.equal("welcome" in sceneEntryOf(scene), false);
  });
});
