#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current";
const assets = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const page = fs.readFileSync(path.join(assets, "app-initial~app-main~page-ClBbNyfy.js"), "utf8");
const local = fs.readFileSync(path.join(assets, "local-conversation-thread-CU8tsPvp.js"), "utf8");
const localPage = fs.readFileSync(path.join(assets, "local-conversation-page-7HmNxUJC.js"), "utf8");
const chatgptPage = fs.readFileSync(path.join(assets, "chatgpt-conversation-page-CQpHKaKm.js"), "utf8");

function dump(label, src, needle, before = 200, after = 600) {
  const i = src.indexOf(needle);
  console.log("\n====", label, "idx", i);
  if (i < 0) return;
  console.log(src.slice(Math.max(0, i - before), i + after));
}

function count(src, re) {
  return (src.match(re) || []).length;
}

dump("threadHandoff in page", page, "threadHandoff:", 100, 900);
dump("threadHandoff in local", local, "threadHandoff", 100, 900);
dump("onLocalSubmitStart", local, "onLocalSubmitStart", 120, 800);

let aw = page.indexOf("async function Aw(e,t,n,r){");
if (aw < 0) aw = page.indexOf("function Aw(e,t,n,r){");
if (aw < 0) aw = page.indexOf("async function Aw(");
console.log("\n==== Aw def", aw);
if (aw >= 0) console.log(page.slice(aw, aw + 2800));

// Sidebar click for codex vs chatgpt
dump("eAe kind codex", page, "kind:`codex`", 80, 500);
dump("Aw( call site near sidebar", page, "Aw(", 40, 200);

for (const needle of [
  "handoffThread",
  "threadHandoff",
  "startCompletionStream",
  "conversationOrigin",
  "composerMode",
  "createChatgpt",
  "forkConversation",
  "continueAs",
  "/backend-api/conversation",
  "turn/start",
]) {
  console.log(
    needle,
    "page",
    count(page, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")),
    "local",
    count(local, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")),
    "localPage",
    count(localPage, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")),
    "chatgpt",
    count(chatgptPage, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")),
  );
}

// Find handoff-related UI strings
for (const needle of ["Handoff", "Continue with", "Continue in", "Open in Chat", "ChatGPT"]) {
  const idxs = [];
  let from = 0;
  while (idxs.length < 5) {
    const i = local.indexOf(needle, from);
    if (i < 0) break;
    idxs.push(i);
    from = i + needle.length;
  }
  console.log("\nlocal needle", needle, idxs);
  for (const i of idxs.slice(0, 2)) {
    console.log(local.slice(Math.max(0, i - 80), i + 200));
  }
}
