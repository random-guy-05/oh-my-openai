#!/usr/bin/env node
"use strict";
/**
 * Dump ChatGPT models catalog parsing (Hn) + Ug/Cg picker builders + bridge model wiring.
 */
const fs = require("fs");
const path = require("path");
const ASSETS = path.join(__dirname, "..", "src/mac-x64/_asar/webview/assets");

const chat = fs.readFileSync(
  path.join(ASSETS, fs.readdirSync(ASSETS).find((f) => f.includes("nmo0zeut") && f.endsWith(".js"))),
  "utf8",
);
const settings = fs.readFileSync(
  path.join(ASSETS, fs.readdirSync(ASSETS).find((f) => f.includes("unq8yzli") && f.endsWith(".js"))),
  "utf8",
);
const send = fs.readFileSync(
  path.join(ASSETS, fs.readdirSync(ASSETS).find((f) => f.includes("oxnpxkxc") && f.endsWith(".js"))),
  "utf8",
);

function dump(label, src, needle, before = 0, after = 600) {
  const i = src.indexOf(needle);
  console.log(`\n==== ${label} (${needle.slice(0, 50)}) @${i} ====`);
  if (i < 0) return;
  console.log(src.slice(Math.max(0, i - before), i + after));
}

dump("Hn", chat, "function Hn(");
dump("getModelsResponse", chat, "getModelsResponse");
dump("CDRMergeChatModels", chat, "function CDRMergeChatModels");
dump("models()", chat, "async models(){");
dump("safeGet models", chat, "safeGet(`/models`");

// Ug and Cg in settings
dump("function Ug", settings, "function Ug(");
dump("function Cg", settings, "function Cg(");
dump("function Ve", settings, "function Ve(");
dump("CDRChatPowerSelections", settings, "function CDRChatPowerSelections");
dump("te=CDRMode", settings, "te=CDRMode");
dump("y=CDRMode", settings, "y=CDRMode");

// How mk applies selection
dump("setModelAndReasoningEffort", settings, "setModelAndReasoningEffort");
dump("powerSettingIndex", settings, "powerSettingIndex");

// Bridge model extraction
const mi = send.indexOf("let model=(n&&(n.model");
console.log("\n==== bridge model extract ====");
console.log(send.slice(mi, mi + 400));

// thinking_effort in startCompletionStream request
dump("thinking_effort", send, "thinking_effort:");
dump("thinking_effort chat", chat, "thinking_effort");
