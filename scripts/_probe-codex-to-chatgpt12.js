#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current";
const assets = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const catalog = fs.readFileSync(
  path.join(assets, "app-initial~app-main~onboarding-page~projects-index-page~hotkey-window-thread-page~quick-ch~c6svlhqw-CWfXNvXw.js"),
  "utf8",
);
const quick = fs.readFileSync(path.join(assets, "app-initial~app-main~quick-chat-window-page-Bg2jp_pK.js"), "utf8");
const page = fs.readFileSync(path.join(assets, "app-initial~app-main~page-ClBbNyfy.js"), "utf8");

function dump(src, i, before, after) {
  console.log(src.slice(Math.max(0, i - before), i + after));
}

// How conversationOrigin affects model / stream request
for (const [label, src] of [
  ["catalog", catalog],
  ["quick", quick],
]) {
  console.log("\n########", label, "########");
  let from = 0;
  let n = 0;
  while (n < 12) {
    const i = src.indexOf("conversationOrigin", from);
    if (i < 0) break;
    const slice = src.slice(Math.max(0, i - 60), i + 200);
    if (
      slice.includes("tpp") ||
      slice.includes("null") ||
      slice.includes("model") ||
      slice.includes("request") ||
      slice.includes("FG") ||
      slice.includes("origin")
    ) {
      console.log("\n---", i, "---");
      console.log(slice);
      n++;
    }
    from = i + 18;
  }
}

// Find prepareConversationStream / conversation request building
for (const needle of [
  "prepareConversationStream",
  "conversation_origin",
  "conversationOrigin:",
  "tppOnly",
  "isThirdParty",
  "third_party",
]) {
  console.log(
    "\n",
    needle,
    "catalog",
    (catalog.match(new RegExp(needle, "g")) || []).length,
    "quick",
    (quick.match(new RegExp(needle, "g")) || []).length,
    "page",
    (page.match(new RegExp(needle, "g")) || []).length,
  );
}

const prep = catalog.indexOf("prepareConversationStream");
console.log("\n=== prepareConversationStream ===");
if (prep >= 0) dump(catalog, prep, 100, 800);

const tppOnly = page.indexOf("tppOnly");
console.log("\n=== tppOnly in page ===");
if (tppOnly >= 0) dump(page, tppOnly, 100, 400);

// Jhe models helper
const jhe = page.indexOf("function Jhe(");
console.log("\n=== Jhe ===", jhe);
if (jhe >= 0) dump(page, jhe, 0, 800);
