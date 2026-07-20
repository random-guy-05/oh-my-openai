#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const assets = path.join(__dirname, "../src/mac-x64/_asar/webview/assets");

const SETTINGS = path.join(
  assets,
  "app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~unq8yzli-BVneZysG.js",
);
const PAGEISH = path.join(
  assets,
  "app-initial~app-main~appgen-settings-page~page~appgen-library-page~appgen-page~appgen-setti~ogh9jurw-Ccxu2qV_.js",
);
const BIG = path.join(
  assets,
  "app-initial~avatarOverlayCompositionSurface~app-main~pet-install-modal-host~quick-chat-wind~oieh6gbs-Cqdhv7ms.js",
);
const CHAT = path.join(
  assets,
  "app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~nmo0zeut-Cn9CuVaZ.js",
);

function snip(s, pat, before = 80, after = 400) {
  const i = s.indexOf(pat);
  if (i < 0) return `(missing ${pat})`;
  return s.slice(Math.max(0, i - before), i + after);
}

const settings = fs.readFileSync(SETTINGS, "utf8");
const page = fs.readFileSync(PAGEISH, "utf8");
const big = fs.readFileSync(BIG, "utf8");
const chat = fs.readFileSync(CHAT, "utf8");

console.log("=== settings picker markers ===");
for (const p of ["chat-models-v38", "local-canonical-model-picker", "CDRRuntime.mode()", "te=Cg", "te=CDR"]) {
  console.log(p, settings.includes(p));
}
console.log(snip(settings, "te=CDRRuntime.mode()", 0, 200));

console.log("\n=== page mode / selector ===");
for (const p of [
  "local-canonical-selector",
  "setMode",
  "cdr-product-mode",
  "onModeSelect",
  "productMode",
  "`chat`",
]) {
  console.log(p, (page.split(p).length - 1));
}
console.log(snip(page, "codex-rebuild:local-canonical-selector", 0, 500));

console.log("\n=== big conversationOrigin ===");
let i = 0,
  c = 0;
while (c < 8) {
  i = big.indexOf("conversationOrigin", i);
  if (i < 0) break;
  console.log("---", c, big.slice(i, i + 180).replace(/\n/g, " "));
  i += 20;
  c++;
}

console.log("\n=== chatgpt models in chat module ===");
console.log(snip(chat, "queryKey:[`chatgpt-models`]", 100, 500));
console.log("CDRMerge", chat.includes("CDRMergeChatModels"));
console.log("v37", chat.includes("chat-models-v37"));

// Find where ChatGPT model picker renders options
console.log("\n=== model picker in big file ===");
for (const p of ["selectedLabel", "ModelPicker", "thinkingEffort", "chatgpt-models", "data-model-picker"]) {
  console.log(p, (big.split(p).length - 1));
}
