#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const SETTINGS = path.join(
  ROOT,
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~unq8yzli-BVneZysG.js",
);
const CHAT = path.join(
  ROOT,
  "src/mac-x64/_asar/webview/assets/app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~nmo0zeut-Cn9CuVaZ.js",
);

const settings = fs.readFileSync(SETTINGS, "utf8");
const chat = fs.readFileSync(CHAT, "utf8");

for (const [label, s] of [
  ["settings", settings],
  ["chat", chat],
]) {
  console.log(
    label,
    "v38",
    s.includes("chat-models-v38"),
    "v37",
    s.includes("chat-models-v37"),
    "CDRChatY",
    s.includes("CDRChatY"),
    "publish",
    s.includes("__cdrPublishChatPickerModels"),
  );
}

for (const pat of [
  "chat-models-v38",
  "chat-models-v37",
  "te=CDRRuntime",
  "te=Cg(y",
  "CDRChatY",
  "local-canonical-model-picker",
  "y=_?.models",
  "CDRSetChatY",
]) {
  const i = settings.indexOf(pat);
  console.log("---", pat, "at", i);
  if (i >= 0) console.log(settings.slice(Math.max(0, i - 120), i + 280).replace(/\n/g, " ").slice(0, 450));
}

// Find mk / Cg / Ug near picker
for (const pat of ["function mk(", "function Cg(", "function Ug(", "Cg=(", "Ug=("]) {
  let i = 0;
  let c = 0;
  while (c < 3) {
    i = settings.indexOf(pat, i);
    if (i < 0) break;
    console.log("DEF", pat, i, settings.slice(i, i + 400).replace(/\n/g, " ").slice(0, 400));
    i += 1;
    c += 1;
  }
}

// ChatGPT models query shape
for (const pat of ["chatgpt-models", "client.models", ".models()", "thinkingEffort", "selectedLabel"]) {
  console.log("chat count", pat, (chat.split(pat).length - 1));
  const i = chat.indexOf(pat);
  if (i >= 0) console.log("  sample", chat.slice(Math.max(0, i - 80), i + 200).replace(/\n/g, " ").slice(0, 300));
}
