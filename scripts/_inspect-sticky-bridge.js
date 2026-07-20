#!/usr/bin/env node
"use strict";
const fs = require("fs");
const chat = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~nmo0zeut-Cn9CuVaZ.js",
  "utf8",
);
const settings = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~unq8yzli-BVneZysG.js",
  "utf8",
);
const page = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~appgen-settings-page~page~appgen-library-page~appgen-page~appgen-setti~ogh9jurw-Ccxu2qV_.js",
  "utf8",
);
const local = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/local-conversation-thread-Bnxyo76e.js",
  "utf8",
);

const i = chat.indexOf("startCompletionStream");
console.log("=== startCompletionStream ===");
console.log(chat.slice(i - 100, i + 600));

console.log("\n=== QU in settings ===");
const q = settings.indexOf("async function QU(");
console.log(settings.slice(q, q + 500));
console.log("bridge?", settings.includes("cdr-bridge"));

console.log("\n=== local turns ===");
const t = local.indexOf("conversationTurns");
console.log(local.slice(t - 80, t + 400));
console.log("extras?", local.includes("cdr-thread-extras") || local.includes("local-canonical-v36"));

console.log("\n=== page mode block ===");
const m = page.indexOf("chat-usage-v42:mode");
console.log(page.slice(m - 100, m + 450));

// How pc/gc chatgpt send works in big file
const big = fs
  .readdirSync("src/mac-x64/_asar/webview/assets")
  .find((f) => f.includes("oieh6gbs") && f.endsWith(".js"));
const b = fs.readFileSync("src/mac-x64/_asar/webview/assets/" + big, "utf8");
const pc = b.indexOf("async function pc(");
console.log("\n=== pc chatgpt send ===", pc);
if (pc >= 0) console.log(b.slice(pc, pc + 700));
