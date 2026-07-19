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
const page = fs.readFileSync(path.join(assets, "app-initial~app-main~page-ClBbNyfy.js"), "utf8");

function dump(src, needle, before = 50, after = 800) {
  const i = src.indexOf(needle);
  console.log("\n====", needle, i);
  if (i < 0) return;
  console.log(src.slice(Math.max(0, i - before), i + after));
}

dump(settings, "function Oyt(", 0, 500);
dump(settings, "function Ayt(", 0, 400);
dump(settings, "function jyt(", 0, 1500);
dump(settings, "routeKind:`local-thread`", 80, 400);
dump(settings, "local-thread", 40, 300);
dump(settings, "client-local-thread", 40, 300);
dump(settings, "turn/start", 80, 500);

// How does work conversation submit differ when it has local execution?
dump(settings, "tppExecutionTarget", 60, 400);

// Search page for mode=chat handling on local routes
dump(page, "mode=chat", 40, 200);
dump(page, "searchParams", 40, 200);
dump(page, "CDRChatModeFromRoute", 40, 400);
