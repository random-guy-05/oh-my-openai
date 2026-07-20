#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

// Simulate the patch in memory
const CHAT = path.join(
  __dirname,
  "../src/mac-x64/_asar/webview/assets/app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~nmo0zeut-Cn9CuVaZ.js",
);
let out = fs.readFileSync(CHAT, "utf8");
console.log("disk has ensure?", out.includes("sticky-chat-v45:ensure-client"));
console.log("disk L=", out.includes("L=f(p,()=>new fa)}));"));

const MARKER = "codex-rebuild:sticky-chat-v45";
const from = "L=f(p,()=>new fa)}));";
const to =
  "L=f(p,()=>{let c=new fa;try{globalThis.__cdrChatClient=c}catch{}return c});try{globalThis.__cdrEnsureChatClient=()=>{try{if(globalThis.__cdrChatClient&&typeof globalThis.__cdrChatClient.startCompletionStream===`function`)return globalThis.__cdrChatClient;let c=new fa;globalThis.__cdrChatClient=c;return c}catch(e){try{console.error(`[cdr] ensure ChatGPT client failed`,e)}catch{}return null}}}catch{}/* " +
  MARKER +
  ":ensure-client */)}));";

console.log("from count", out.split(from).length - 1);
console.log("\nORIGINAL CONTEXT:");
const i = out.indexOf(from);
console.log(out.slice(i - 80, i + from.length + 40));

out = out.replace(from, to);
console.log("\nPATCHED CONTEXT:");
const j = out.indexOf(MARKER + ":ensure-client");
console.log(out.slice(j - 200, j + 80));

console.log("\nAround 66462:");
console.log(out.slice(66400, 66540));

try {
  acorn.parse(out, { ecmaVersion: "latest", sourceType: "module" });
  console.log("parse OK");
} catch (err) {
  console.log("parse FAIL", err.message);
  const m = /(\d+):(\d+)/.exec(err.message);
  if (m) {
    // acorn line:col for module often line 1
    const col = Number(m[2]);
    console.log("at col", col);
    console.log(out.slice(Math.max(0, col - 80), col + 80));
  }
}
