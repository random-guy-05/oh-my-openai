#!/usr/bin/env node
"use strict";
/**
 * Dump live Chat picker + bridge model defaults + ChatGPT models() shape.
 */
const asar = require("@electron/asar");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(
  os.homedir(),
  "Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar",
);
const SRC = path.join(__dirname, "..", "src/mac-x64/_asar/webview/assets");

function load(namePart) {
  if (fs.existsSync(ROOT)) {
    const f = asar
      .listPackage(ROOT)
      .find((x) => x.includes(namePart) && x.endsWith(".js"));
    if (f) return asar.extractFile(ROOT, f.replace(/^\//, "")).toString("utf8");
  }
  const f = fs.readdirSync(SRC).find((x) => x.includes(namePart) && x.endsWith(".js"));
  return fs.readFileSync(path.join(SRC, f), "utf8");
}

const settings = load("unq8yzli");
const send = load("oxnpxkxc");
const chat = load("nmo0zeut");

console.log("==== markers settings ====");
for (const m of [
  "chat-models-v39",
  "CDRChatPowerSelections",
  "CDRChatModelsForPicker",
  "CDRMergeChatModels",
  "gpt-5.6-sol",
  "5.5 Instant",
  "local-canonical-model-picker",
]) {
  console.log(m, settings.includes(m));
}

const h = settings.indexOf("function CDRChatPowerSelections");
console.log("\n==== CDRChatPowerSelections ====");
console.log(settings.slice(h, h + 900));

const y = settings.indexOf("CDRMode===`chat`?CDRChatModelsForPicker");
console.log("\n==== y/te ====");
console.log(settings.slice(y - 80, y + 350));

// Bridge model default
const b = send.indexOf("sticky-chat-v51:bridge-fn");
console.log("\n==== bridge model default ====");
const chunk = send.slice(b, b + 3500);
const mi = chunk.indexOf("let model=");
console.log(chunk.slice(mi, mi + 500));

// Chat client models
console.log("\n==== chat client models ====");
for (const needle of [
  "async models()",
  "getModelsResponse",
  "CDRMergeChatModels",
  "safeGet(`/models`",
  "function Hn(",
  "internalModels",
]) {
  const i = chat.indexOf(needle);
  console.log("\n", needle, i);
  if (i >= 0) console.log(chat.slice(i, i + 400));
}

// How startCompletionStream sends model
const sc = chat.indexOf("startCompletionStream");
console.log("\n==== startCompletionStream head ====");
console.log(chat.slice(sc, sc + 800));
