#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current";
const assets = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const page = fs.readFileSync(path.join(assets, "app-initial~app-main~page-ClBbNyfy.js"), "utf8");
const local = fs.readFileSync(path.join(assets, "local-conversation-thread-CU8tsPvp.js"), "utf8");

function allIndexes(src, needle) {
  const out = [];
  let from = 0;
  while (true) {
    const i = src.indexOf(needle, from);
    if (i < 0) break;
    out.push(i);
    from = i + needle.length;
  }
  return out;
}

function dumpAround(src, i, before, after) {
  return src.slice(Math.max(0, i - before), i + after);
}

console.log("=== threadHandoff in page ===");
for (const i of allIndexes(page, "threadHandoff").slice(0, 8)) {
  console.log("\n---", i, "---");
  console.log(dumpAround(page, i, 150, 400));
}

console.log("\n=== forkConversation in page ===");
for (const i of allIndexes(page, "forkConversation").slice(0, 5)) {
  console.log("\n---", i, "---");
  console.log(dumpAround(page, i, 150, 500));
}

// Find Aw assignment / definition via Aw=
console.log("\n=== Aw patterns ===");
for (const needle of ["function Aw(", "Aw=async", "Aw=e", "let Aw=", "const Aw=", "async function Aw", ",Aw=", "Aw=function"]) {
  console.log(needle, page.indexOf(needle));
}

// Look near first Aw( call for surrounding function
const awCall = page.indexOf("Aw(i,e,o,a)");
console.log("\nAw(i,e,o,a) at", awCall);
if (awCall >= 0) console.log(dumpAround(page, awCall, 800, 400));

// Search for navigate to local conversation
for (const needle of [
  "`/local/",
  "/local/",
  "localConversation",
  "kind===`codex`",
  "kind:`local`",
  "source:`codex`",
  "source===`codex`",
]) {
  const idxs = allIndexes(page, needle);
  console.log(needle, "count", idxs.length, "first", idxs[0] ?? -1);
  if (idxs[0] != null) console.log(dumpAround(page, idxs[0], 80, 250));
}

// Find Cf component / handoff trigger
console.log("\n=== Cf handoff component usage in local ===");
const cf = local.indexOf("function Cf(");
console.log("function Cf", cf);
if (cf >= 0) console.log(dumpAround(local, cf, 0, 2000));

// Search assets for startCompletionStream / backend conversation
const files = fs.readdirSync(assets).filter((n) => n.endsWith(".js"));
const hits = [];
for (const name of files) {
  const src = fs.readFileSync(path.join(assets, name), "utf8");
  if (src.includes("startCompletionStream") || src.includes("conversationOrigin")) {
    hits.push({
      name,
      startCompletionStream: src.includes("startCompletionStream"),
      conversationOrigin: (src.match(/conversationOrigin/g) || []).length,
      size: src.length,
    });
  }
}
console.log("\n=== files with startCompletionStream/conversationOrigin ===");
console.log(hits.slice(0, 30));
