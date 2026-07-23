#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const ASAR_ROOT = process.env.CDR_ASAR_ROOT
  ? path.resolve(process.env.CDR_ASAR_ROOT)
  : path.join(ROOT, "src/mac-x64/_asar");
const ASSETS = path.join(ASAR_ROOT, "webview/assets");

function asset(namePart) {
  const name = fs
    .readdirSync(ASSETS)
    .find((entry) => entry.includes(namePart) && entry.endsWith(".js"));
  assert.ok(name, `missing ${namePart} asset`);
  return fs.readFileSync(path.join(ASSETS, name), "utf8");
}

function extractFunction(source, startNeedle) {
  const start = source.indexOf(startNeedle);
  assert.ok(start >= 0, `missing ${startNeedle}`);
  let depth = 0;
  let started = false;
  for (let index = start; index < source.length; index++) {
    if (source[index] === "{") {
      depth++;
      started = true;
    } else if (source[index] === "}") {
      depth--;
      if (started && depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unclosed ${startNeedle}`);
}

const chat = asset("nmo0zeut");
const settings = asset("unq8yzli");
const send = asset("oxnpxkxc");
const mergeSource = extractFunction(chat, "function CDRMergeChatModels(");

let eventCount = 0;
const context = {
  console,
  CustomEvent: class CustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
  },
};
context.window = {
  dispatchEvent(event) {
    if (event.type === "cdr-chat-models-change") eventCount++;
  },
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(`${mergeSource};globalThis.merge=CDRMergeChatModels;`, context);

const catalog = {
  defaultModelSlug: "gpt-5-5",
  options: [
    { slug: "gpt-5-5", selectedLabel: "Instant", lane: "instant" },
  ],
  versionOptions: [
    {
      label: "GPT-5.6 Sol",
      options: [
        {
          slug: "gpt-5-5",
          title: "Instant",
          selectedLabel: "Instant",
          lane: "instant",
        },
        {
          slug: "gpt-5-6-thinking",
          title: "GPT-5.6",
          selectedLabel: "Medium",
          thinkingEffort: "standard",
          lane: "thinking",
        },
        {
          slug: "gpt-5-6-thinking",
          title: "GPT-5.6",
          selectedLabel: "High",
          thinkingEffort: "extended",
          lane: "thinking",
        },
      ],
    },
  ],
};

context.merge(catalog);
context.merge(JSON.parse(JSON.stringify(catalog)));
assert.strictEqual(eventCount, 1, "unchanged catalog must dispatch exactly once");
assert.deepStrictEqual(
  Array.from(context.__cdrChatPowerRows, (row) => row.reasoningEffort),
  ["none", "none", "none"],
);
assert.deepStrictEqual(
  Array.from(context.__cdrChatPowerRows, (row) => row.apiEffort),
  ["none", "standard", "extended"],
);
assert.deepStrictEqual(
  Array.from(context.__cdrChatPowerRows, (row) => row.modelLabel),
  ["GPT-5.6 Sol Instant", "GPT-5.6 Sol Medium", "GPT-5.6 Sol High"],
);
assert.deepStrictEqual(
  Array.from(context.__cdrChatPickerModels, (model) => model.displayName),
  ["GPT-5.6 Sol Instant", "GPT-5.6 Sol Medium", "GPT-5.6 Sol High"],
);
assert.strictEqual(new Set(context.__cdrChatPickerModels.map((m) => m.model)).size, 3);
assert.ok(context.__cdrChatPickerModels.every((m) => m.defaultReasoningEffort === "none"));
assert.deepStrictEqual(
  Array.from(context.__cdrChatPowerRows, (row) => [row.apiModel, row.apiEffort]),
  [["gpt-5-5", "none"], ["gpt-5-6-thinking", "standard"], ["gpt-5-6-thinking", "extended"]],
);
assert.ok(context.__cdrChatDefaultSlug.startsWith("chat:"));
assert.ok(
  Array.from(context.__cdrChatPowerRows).every(
    (row) => typeof row.sliderLabel === "string" && row.sliderLabel.length > 0,
  ),
  "every Chat model row must bypass formatMessage with a concrete sliderLabel",
);
assert.doesNotThrow(() => {
  for (const row of context.__cdrChatPowerRows) {
    row.sliderLabel ?? (() => { throw new Error("formatMessage received no descriptor"); })();
  }
});

const changed = JSON.parse(JSON.stringify(catalog));
changed.versionOptions[0].options.push({
  slug: "o3",
  selectedLabel: "o3 Medium",
  lane: "thinking",
});
context.merge(changed);
assert.strictEqual(eventCount, 2, "changed catalog must publish one new event");

assert.ok(settings.includes("codex-rebuild:chat-models-v56:load"));
assert.ok(settings.includes("codex-rebuild:chat-models-v55:effort-guard"));
assert.ok(settings.includes("codex-rebuild.reasoning.medium"));
assert.ok(settings.includes("codex-rebuild.reasoning.high"));
assert.ok(settings.includes("codex-rebuild.reasoning.standard"));
assert.ok(settings.includes("codex-rebuild.reasoning.extended"));
assert.ok(!settings.includes("let curModel=T"));
assert.ok(settings.includes("},[CDRMode,o])"));
assert.ok(!settings.includes("},[CDRMode,o,w,T,S])"));
assert.ok(settings.includes("showReasoningEffortControls:CDRMode!==`chat`"));
assert.ok(settings.includes("onSelectReasoningEffort:CDRMode===`chat`?void 0"));
assert.ok(settings.includes("CDRMode===`chat`?null:(0,yk.jsx)(Jr"));
assert.ok(send.includes("codex-rebuild:chat-models-v56:bridge-model"));
assert.ok(send.includes("model=row.apiModel;effort=row.apiEffort"));
assert.ok(chat.includes("codex-rebuild:chat-models-v56:slider-label"));
assert.ok(chat.includes("codex-rebuild:chat-models-v56:model-label"));

console.log("v56 flat live selector tests passed");
