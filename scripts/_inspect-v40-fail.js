#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const assets = path.join(__dirname, "../src/mac-x64/_asar/webview/assets");
const SETTINGS = path.join(
  assets,
  "app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~unq8yzli-BVneZysG.js",
);
const PAGE = path.join(
  assets,
  "app-initial~app-main~appgen-settings-page~page~appgen-library-page~appgen-page~appgen-setti~ogh9jurw-Ccxu2qV_.js",
);
const CHAT = path.join(
  assets,
  "app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~nmo0zeut-Cn9CuVaZ.js",
);

for (const [label, p] of [
  ["page", PAGE],
  ["settings", SETTINGS],
  ["chat", CHAT],
]) {
  const s = fs.readFileSync(p, "utf8");
  const markers = [...s.matchAll(/codex-rebuild:[a-z0-9:-]+/g)].map((m) => m[0]);
  console.log("\n====", label, [...new Set(markers)].sort().join(", "));
}

const s = fs.readFileSync(SETTINGS, "utf8");
const pats = [
  "s.__cdrLocalModeV4; })();let o=n(O)",
  "s.__cdrLocalModeV4; })();let[CDRMode",
  "chat-models-v38",
  "CDRChatY",
  "te=Cg(y,l),ne=Ug(y)",
  "te=CDRRuntime",
  "te=(CDRMode",
  "chat-usage-v40",
  "local-canonical-model-picker-v5",
  "registerModelController",
  "[u,d]=(0,_k.useState)(null),f=Rl(e)",
  "[u,d]=(0,_k.useState)(null),[CDRChatY",
];
for (const pat of pats) {
  const i = s.indexOf(pat);
  console.log(JSON.stringify(pat), i);
  if (i >= 0) console.log(" ", s.slice(i, i + 220).replace(/\n/g, " ").slice(0, 220));
}

// Find runtime close pattern near mk
const mk = s.indexOf("local-canonical-model-picker-v5");
console.log("\naround runtime end:");
const chunk = s.slice(mk, mk + 8000);
const idx = chunk.indexOf("__cdrLocalModeV4");
console.log(chunk.slice(Math.max(0, idx - 50), idx + 400));

const page = fs.readFileSync(PAGE, "utf8");
console.log("\npage v40?", page.includes("chat-usage-v40"));
console.log(
  "force-codex?",
  page.includes(
    "if(r!==`codex`)sae(i,{currentMode:r,navigate:a,nextMode:`codex`",
  ),
);
const chat = fs.readFileSync(CHAT, "utf8");
console.log("chat v40?", chat.includes("chat-usage-v40"));
console.log("chat merge?", chat.includes("CDRMergeChatModels"));
