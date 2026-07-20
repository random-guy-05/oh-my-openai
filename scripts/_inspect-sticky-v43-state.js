#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const assets = path.join(ROOT, "src/mac-x64/_asar/webview/assets");

const page = fs.readFileSync(
  path.join(
    assets,
    "app-initial~app-main~appgen-settings-page~page~appgen-library-page~appgen-page~appgen-setti~ogh9jurw-Ccxu2qV_.js",
  ),
  "utf8",
);
const i = page.indexOf("chat-usage-v42");
console.log("=== PAGE v42 block ===");
console.log(page.slice(Math.max(0, i - 250), i + 950));

const settings = fs.readFileSync(
  path.join(
    assets,
    "app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~unq8yzli-BVneZysG.js",
  ),
  "utf8",
);
const j = settings.indexOf("function mk(");
console.log("\n=== mk head ===");
console.log(settings.slice(j, j + 700));
const k = settings.indexOf(",te=");
console.log("\n=== te ===");
console.log(settings.slice(k, k + 220));
const pickerMode = settings.indexOf("picker-mode");
console.log("\n=== picker-mode ===");
console.log(settings.slice(Math.max(0, pickerMode - 120), pickerMode + 200));

const local = fs.readFileSync(
  path.join(assets, "local-conversation-thread-Bnxyo76e.js"),
  "utf8",
);
const t = local.indexOf("conversationTurns");
console.log("\n=== conversationTurns ===");
console.log(local.slice(Math.max(0, t - 100), t + 250));

const chat = fs.readFileSync(
  path.join(
    assets,
    "app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~nmo0zeut-Cn9CuVaZ.js",
  ),
  "utf8",
);
for (const needle of [
  "startCompletionStream",
  "async startCompletion",
  "createConversation",
  "conversation_id",
]) {
  let idx = 0;
  let n = 0;
  while ((idx = chat.indexOf(needle, idx)) >= 0 && n < 3) {
    console.log(`\n=== ${needle} @${idx} ===`);
    console.log(chat.slice(idx, idx + 400));
    idx += needle.length;
    n++;
  }
}

const send = fs.readFileSync(
  path.join(
    assets,
    "app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~oxnpxkxc-D1ceIDrn.js",
  ),
  "utf8",
);
const od = send.indexOf("async function oD(e,t,n){");
console.log("\n=== oD signature / early body ===");
console.log(send.slice(od, od + 1200));
