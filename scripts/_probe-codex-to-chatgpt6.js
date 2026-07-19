#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { parse } = require("acorn");

const ROOT = "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current";
const assets = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const page = fs.readFileSync(path.join(assets, "app-initial~app-main~page-ClBbNyfy.js"), "utf8");
const catalog = fs.readFileSync(
  path.join(assets, "app-initial~app-main~onboarding-page~projects-index-page~hotkey-window-thread-page~quick-ch~c6svlhqw-CWfXNvXw.js"),
  "utf8",
);
const quick = fs.readFileSync(path.join(assets, "app-initial~app-main~quick-chat-window-page-Bg2jp_pK.js"), "utf8");

function dump(src, i, before, after) {
  console.log(src.slice(Math.max(0, i - before), i + after));
}

const click = page.indexOf("z=({target:t})=>{if(t.source===`chatgpt`)");
console.log("=== sidebar click handler ===", click);
if (click >= 0) dump(page, click, 50, 1200);

// Find Aw via regex in whole page
const awDefs = [...page.matchAll(/function\s+Aw\s*\(/g)];
const awAssign = [...page.matchAll(/\bAw\s*=\s*/g)];
console.log("\nAw function defs", awDefs.map((m) => m.index));
console.log("Aw assigns sample", awAssign.slice(0, 10).map((m) => m.index));
for (const m of awAssign.slice(0, 5)) {
  console.log("\n--- assign", m.index, "---");
  dump(page, m.index, 20, 300);
}

// Search for Aw definition across assets
const files = fs.readdirSync(assets).filter((n) => n.endsWith(".js"));
for (const name of files) {
  const src = fs.readFileSync(path.join(assets, name), "utf8");
  if (/\bfunction Aw\(/.test(src) || /\bAw=async function/.test(src) || /\basync function Aw\(/.test(src)) {
    const i = src.search(/\b(?:async )?function Aw\(/);
    console.log("FOUND Aw in", name, i);
    dump(src, i, 0, 1500);
  }
}

// conversationOrigin usages in catalog / quick
console.log("\n=== conversationOrigin in catalog ===");
let from = 0;
let n = 0;
while (n < 8) {
  const i = catalog.indexOf("conversationOrigin", from);
  if (i < 0) break;
  console.log("\n---", i, "---");
  dump(catalog, i, 80, 350);
  from = i + 18;
  n++;
}

console.log("\n=== startCompletionStream def/use ===");
for (const [label, src] of [
  ["catalog", catalog],
  ["quick", quick],
]) {
  const i = src.indexOf("startCompletionStream");
  console.log(label, i);
  if (i >= 0) dump(src, i, 100, 500);
}

// How local submit works - turn/start
console.log("\n=== turn/start across assets ===");
for (const name of files) {
  const src = fs.readFileSync(path.join(assets, name), "utf8");
  if (src.includes("turn/start") || src.includes("`turn/start`")) {
    console.log(name, "turn/start count", (src.match(/turn\/start/g) || []).length);
  }
}
