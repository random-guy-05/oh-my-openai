#!/usr/bin/env node
"use strict";

const assert = require("assert");
const acorn = require("acorn");
const asar = require("@electron/asar");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ASAR_ROOT = path.join(ROOT, "src/mac-x64/_asar");
const ASSETS = path.join(ASAR_ROOT, "webview/assets");
const MARKER = "codex-rebuild:professional-chat-mode-v58";

const names = fs.readdirSync(ASSETS);
const read = (needle) => {
  const name = names.find((entry) => entry.includes(needle) && entry.endsWith(".js"));
  assert(name, `missing ${needle}`);
  return fs.readFileSync(path.join(ASSETS, name), "utf8");
};

const page = read("ogh9jurw");
const settings = read("unq8yzli");
const feedback = read("eoalflv1");
const send = read("oxnpxkxc");

for (const [label, source] of Object.entries({ page, settings, feedback, send })) {
  assert.doesNotThrow(
    () => acorn.parse(source, { ecmaVersion: "latest", sourceType: "module" }),
    `${label} must parse`,
  );
}

assert(page.includes("Chat preset — same task and history"));
assert(page.includes(MARKER + ":same-thread"));
assert(!page.includes("native-chat-continuity-v57"));
assert(!page.includes("chat-usage-v42:sync"));
assert(settings.includes("te=CDRMode===`chat`?Ug(y):Cg(y,l)"));
assert(settings.includes("showReasoningEffortControls:CDRMode!==`chat`"));
assert(settings.includes("cdr.chat.modelPicker.title"));
assert(!settings.includes("CDRChatFlatSelector"));
assert(!settings.includes("__cdrChatPickerModels"));
assert(feedback.includes(MARKER + ":usage-badge"));
assert(feedback.includes("quotaPercent.toFixed(1)"));
assert(feedback.includes("tokens.toLocaleString()"));
assert(send.includes("codex-rebuild:usage-guard-v1"));
assert(!send.includes("CDRStickyChatSend"));

const packed = path.join(ROOT, "out/app-professional-chat-mode-v58.asar");
if (fs.existsSync(packed)) {
  for (const [label, name] of [
    ["page", names.find((entry) => entry.includes("ogh9jurw") && entry.endsWith(".js"))],
    ["settings", names.find((entry) => entry.includes("unq8yzli") && entry.endsWith(".js"))],
    ["feedback", names.find((entry) => entry.includes("eoalflv1") && entry.endsWith(".js"))],
    ["send", names.find((entry) => entry.includes("oxnpxkxc") && entry.endsWith(".js"))],
  ]) {
    const source = asar.extractFile(packed, `webview/assets/${name}`).toString("utf8");
    assert.doesNotThrow(
      () => acorn.parse(source, { ecmaVersion: "latest", sourceType: "module" }),
      `packed ${label} must parse`,
    );
  }
}

console.log("v58 same-thread Chat picker, task guard, and usage badge tests passed");
