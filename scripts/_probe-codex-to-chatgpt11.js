#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current";
const assets = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const local = fs.readFileSync(path.join(assets, "local-conversation-thread-CU8tsPvp.js"), "utf8");
const localPage = fs.readFileSync(path.join(assets, "local-conversation-page-7HmNxUJC.js"), "utf8");
const page = fs.readFileSync(path.join(assets, "app-initial~app-main~page-ClBbNyfy.js"), "utf8");
const catalog = fs.readFileSync(
  path.join(assets, "app-initial~app-main~onboarding-page~projects-index-page~hotkey-window-thread-page~quick-ch~c6svlhqw-CWfXNvXw.js"),
  "utf8",
);

function dump(src, i, before, after) {
  console.log(src.slice(Math.max(0, i - before), i + after));
}

// How does local submit work?
for (const needle of [
  "onLocalSubmitStart",
  "sendUserMessage",
  "turn/start",
  "startTurn",
  "submitPrompt",
  "composerMode:`local`",
  "composerMode===`local`",
  "collaborationMode",
]) {
  console.log(needle, "local", local.indexOf(needle), "localPage", localPage.indexOf(needle));
}

const ols = local.indexOf("onLocalSubmitStart");
console.log("\n=== onLocalSubmitStart wider ===");
if (ols >= 0) dump(local, ols, 800, 200);

// Find O= definition near onLocalSubmitStart:f?O
const oAssign = local.indexOf("onLocalSubmitStart:f?O");
console.log("\n=== find O function before onLocalSubmitStart ===");
if (oAssign >= 0) {
  // walk back for ,O= or let O=
  const window = local.slice(Math.max(0, oAssign - 2500), oAssign + 100);
  console.log(window);
}

// Look for creating chatgpt conversation from messages / import
for (const needle of [
  "createConversation",
  "newConversation",
  "startConversation",
  "conversation/create",
  "gizmo_id",
  "importConversation",
  "seedConversation",
]) {
  const c = (catalog.match(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
  const q = (page.match(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
  console.log(needle, "catalog", c, "page", q);
}

// ChatGPT conversation route pattern
for (const needle of ["`/c/", "path:`/c/", "chatgpt-conversation", "dt(e", "function dt("]) {
  console.log(needle, "page", page.indexOf(needle));
}
