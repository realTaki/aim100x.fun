import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CHIP_LANGUAGE_POLICY,
  THREAD_LANGUAGE_POLICY,
  chatFanLines,
  chatIdolLines,
  chatToolPolicy,
} from "./chat-prompt.ts";

describe("chatIdolLines", () => {
  it("uses English labels and keeps as-written idol fields in any language", () => {
    const lines = chatIdolLines({
      name: "Natalie100x",
      personality: "直球、会撩、偶尔傲娇，对粉丝很黏。",
      look: "黑发挑染紫，街头休闲，猫眼妆。",
      bio: "up this late for me? stay.",
      voice: "eve",
      website: "https://natalie.example",
      twitter: "@natalie",
    });
    const text = lines.join("\n");
    assert.match(text, /^You are roleplaying as Natalie100x,/);
    assert.match(text, /^Personality: 直球、会撩、偶尔傲娇，对粉丝很黏。$/m);
    assert.match(text, /^Bio: up this late for me\? stay\.$/m);
    assert.match(text, /^Look: 黑发挑染紫，街头休闲，猫眼妆。$/m);
    assert.match(text, /^Voice: eve$/m);
    assert.match(text, /^Website: https:\/\/natalie\.example$/m);
    assert.match(text, /^X\/Twitter: @natalie$/m);
    assert.match(text, /That Look is your visual identity/);
    assert.equal(text.includes("人设"), false);
    assert.equal(text.includes("Chinese (zh-CN)"), false);
  });

  it("still prints Look when empty so generate_new_photos is blocked", () => {
    const text = chatIdolLines({ name: "Natalie", look: "  " }).join("\n");
    assert.match(text, /^Look: $/m);
    assert.match(text, /Look is empty\. You do not know your appearance, so do not call generate_new_photos\./);
    assert.equal(text.includes("That Look is your visual identity"), false);
  });
});

describe("chatFanLines", () => {
  it("includes username and bio as written, without a locale reply override", () => {
    const text = chatFanLines({
      username: "Taki",
      bio: "夜猫子研究员",
      locale: "zh-CN",
    }).join("\n");
    assert.match(text, /^Fan name: Taki$/m);
    assert.match(text, /^Fan bio: 夜猫子研究员$/m);
    assert.equal(text.includes("Fan language"), false);
    assert.equal(text.includes("Always reply"), false);
    assert.equal(text.includes("Chinese"), false);
  });

  it("does not invent a fan name when the profile is empty", () => {
    const text = chatFanLines().join("\n");
    assert.match(text, /^Fan name: $/m);
    assert.equal(text.includes("unknown"), false);
    assert.equal(text.includes("Match the language"), false);
  });
});

describe("THREAD_LANGUAGE_POLICY", () => {
  it("follows the fan's latest message and forbids translating profile fields", () => {
    assert.match(THREAD_LANGUAGE_POLICY, /You can read any language/);
    assert.match(THREAD_LANGUAGE_POLICY, /fan's latest message/);
    assert.match(THREAD_LANGUAGE_POLICY, /Do not lock to prefer language/);
    assert.match(THREAD_LANGUAGE_POLICY, /Do not translate idol or fan profile fields/);
    assert.equal(THREAD_LANGUAGE_POLICY.includes("Match the language of this thread"), false);
  });
});

describe("chatToolPolicy", () => {
  it("tells the model to use API tool_calls, never homemade run-tool prose", () => {
    const withTools = chatToolPolicy(true).join("\n");
    assert.match(withTools, /tool_calls field/);
    assert.match(withTools, /Never write tool names, arguments, image ids/);
    assert.equal(withTools.includes("run tool send_photo"), false);
    assert.equal(withTools.includes("No JSON wrapper"), false);
    const without = chatToolPolicy(false).join("\n");
    assert.match(without, /You cannot attach photos or voice notes this turn/);
    assert.equal(without.includes("use the request tools"), false);
  });
});

describe("CHIP_LANGUAGE_POLICY", () => {
  it("uses the fan's latest message after init, not prefer language", () => {
    assert.match(CHIP_LANGUAGE_POLICY, /fan's latest message/);
    assert.match(CHIP_LANGUAGE_POLICY, /If they have not sent a message yet, match the welcome and scene opening/);
    assert.match(CHIP_LANGUAGE_POLICY, /Do not lock to prefer language/);
  });
});
