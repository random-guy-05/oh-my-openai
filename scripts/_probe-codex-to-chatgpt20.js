#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current";
const assets = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const settings = fs.readFileSync(
  path.join(
    assets,
    "app-initial~app-main~appgen-settings-page~pull-request-route~onboarding-page~settings-page~~iaab4bzx-BHK3miry.js",
  ),
  "utf8",
);
const local = fs.readFileSync(path.join(assets, "local-conversation-thread-CU8tsPvp.js"), "utf8");
const localPage = fs.readFileSync(path.join(assets, "app-initial~app-main~local-conversation-page-C_d1yVzV.js"), "utf8");

function dump(src, needle, before = 100, after = 700) {
  const i = src.indexOf(needle);
  console.log("\n====", needle, "@", i);
  if (i < 0) return;
  console.log(src.slice(Math.max(0, i - before), i + after));
}

// Find turn/start send
dump(settings, "`turn/start`", 120, 800);
dump(settings, '"turn/start"', 120, 800);
dump(settings, "turn/start", 120, 500);

// Local composer submit path - search for sendRequest or startTurn-like
for (const needle of [
  "sendRequest(`turn/start`",
  "sendRequest(`turn/start",
  "turn/start`,{",
  "startTurn(",
  "onSubmit",
  "submitTurn",
  "addUserMessage",
]) {
  console.log(needle, "settings", settings.indexOf(needle), "local", local.indexOf(needle), "localPage", localPage.indexOf(needle));
}

// In local thread, find vs composer and what it calls
dump(local, "function vs(", 0, 500);
dump(local, "vs={", 0, 200);

// How does local page know mode=chat?
dump(localPage, "mode", 40, 200);
dump(localPage, "cdr-product-mode", 40, 200);
dump(local, "cdr-product-mode", 40, 200);

// Look for model selection in local - maybe we can force chatgpt models into appserver?
dump(local, "selectedModel", 60, 300);
dump(local, "model:", 40, 200);
