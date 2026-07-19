#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current";
const assets = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const page = fs.readFileSync(path.join(assets, "app-initial~app-main~page-ClBbNyfy.js"), "utf8");
const localPage = fs.readFileSync(path.join(assets, "app-initial~app-main~local-conversation-page-C_d1yVzV.js"), "utf8");
const localThread = fs.readFileSync(path.join(assets, "local-conversation-thread-CU8tsPvp.js"), "utf8");
const catalog = fs.readFileSync(
  path.join(assets, fs.readdirSync(assets).find((n) => n.includes("quick-ch") && n.includes("projects-index") && n.endsWith(".js"))),
  "utf8",
);

function contexts(src, needle, limit = 5, radius = 160) {
  let i = 0, n = 0;
  while ((i = src.indexOf(needle, i)) !== -1 && n < limit) {
    console.log(`\n[${needle}#${n}]`, src.slice(Math.max(0, i - radius), i + radius).replace(/\n/g, " "));
    i += needle.length;
    n++;
  }
}

console.log("==== local page contents hints ====");
for (const needle of [
  "turn/start",
  "startCompletion",
  "conversationId",
  "projectId",
  "composerMode",
  "local",
  "remote",
  "chatgpt",
  "onSubmit",
  "sendMessage",
]) {
  console.log(needle, localPage.split(needle).length - 1, localThread.split(needle).length - 1);
}

console.log("\n==== local thread submit path ====");
contexts(localThread, "turn/start", 5, 200);
contexts(localThread, "startCompletion", 5, 200);
contexts(localThread, "composerMode", 5, 150);
contexts(localPage, "LocalConversation", 5, 150);

// How sidebar opens codex project threads
console.log("\n==== sidebar codex project open ====");
contexts(page, "source===`codex`", 8, 180);
contexts(page, "source:`codex`", 5, 120);
contexts(page, "/local/", 8, 120);

// Can chatgpt conversations be in local projects?
contexts(catalog, "gizmo_id", 5, 120);
contexts(catalog, "projectId", 5, 100);
contexts(page, "chatgpt-project", 5, 100);
