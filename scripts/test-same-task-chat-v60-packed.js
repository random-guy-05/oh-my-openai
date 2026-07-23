#!/usr/bin/env node
"use strict";

const assert = require("assert");
const acorn = require("acorn");
const asar = require("@electron/asar");
const fs = require("fs");
const path = require("path");

const packed = path.join(__dirname, "..", "out", "app-same-task-chat-v61.asar");
const files = asar.listPackage(packed).filter((name) => name.endsWith(".js"));
const read = (fragment) => {
  const name = files.find((entry) => entry.includes(fragment));
  assert(name, `missing ${fragment}`);
  return asar.extractFile(packed, name.replace(/^\//, "")).toString("utf8");
};

const page = read("ogh9jurw");
const settings = read("unq8yzli");
const catalog = read("nmo0zeut");
const send = read("oxnpxkxc");
const local = read("local-conversation-thread");
const actions = read("c33rimzq");

for (const [name, source] of Object.entries({ page, settings, catalog, send, local, actions })) {
  assert.doesNotThrow(() => acorn.parse(source, { ecmaVersion: "latest", sourceType: "module" }), `${name} parses`);
}
assert(page.includes("sticky-chat-v43:mode"), "same-task mode controller missing");
assert(!page.includes("native-chat-continuity-v57:handoff"), "native ChatGPT navigation regressed");
assert(settings.includes("same-task-chat-v61:native-picker-inputs"));
assert(settings.includes("same-task-chat-v61:display-selection"));
assert(settings.includes("same-task-chat-v61:preserve-codex-model"));
assert(settings.includes("const resolveKey = (store, threadKey, threadId)"), "task-limit aliases missing");
assert(!settings.includes("cdr.chat.modelPicker.title"), "custom Chat picker styling remains");
assert(!settings.includes("y(e.model,`none`)") , "Chat picker still mutates Codex model state");
assert(!settings.includes("CDRMode===`chat`?(0,yk.jsx)(CDRChatFlatSelector"), "plain select still renders");
assert(catalog.includes("same-task-chat-v61:authoritative-catalog"));
assert(catalog.includes("same-task-chat-v61:raw-model-titles"));
assert(!catalog.includes("versions.flatMap"), "historical model choices remain active");
assert(send.includes("same-task-chat-v61:bridge"));
assert(send.includes("codex-rebuild:usage-guard-v1"), "task-limit guard was removed");
assert(send.includes("value?.aliases?.[rawKey] || rawKey"), "fallback task-limit aliases missing");
assert(local.includes("same-task-chat-v61:transcript"));
assert(actions.includes("same-task-chat-v61:task-usage-badge"));
assert(actions.includes("CDRTaskUsageBadge,{threadId:y}"));
assert(actions.includes("fiveHourDelta.toFixed(1)"));
assert(actions.includes("totalTokens).toLocaleString()"));
assert(actions.includes('if (mode === "chat") return null'), "Codex task usage badge leaks into Chat mode");

console.log("[ok] packed v61 preserves the Codex surface/state and contains the authoritative native Chat picker, stream bridge, transcript continuity, working task guard aliases, and exact-token action badge");
