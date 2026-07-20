#!/usr/bin/env node
"use strict";
/**
 * Rewrite the L=f ensure-client replacement in _apply-sticky-chat-v45.js
 * with a brace-correct string, then dry-run parse the chat bundle.
 */
const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

const ROOT = path.join(__dirname, "..");
const applyPath = path.join(__dirname, "_apply-sticky-chat-v45.js");
const CHAT = path.join(
  ROOT,
  "src/mac-x64/_asar/webview/assets/app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~nmo0zeut-Cn9CuVaZ.js",
);

const MARKER = "codex-rebuild:sticky-chat-v45";

// Correct ending: close outer try/catch, then close IIFE body `}`, then `));`
// Original: L=f(p,()=>new fa)}));
//                                  ^IIFE  ^^wrapper
const toFixed =
  "L=f(p,()=>{let c=new fa;try{globalThis.__cdrChatClient=c}catch{}return c});" +
  "try{globalThis.__cdrEnsureChatClient=()=>{try{" +
  "if(globalThis.__cdrChatClient&&typeof globalThis.__cdrChatClient.startCompletionStream===`function`)return globalThis.__cdrChatClient;" +
  "let c=new fa;globalThis.__cdrChatClient=c;return c" +
  "}catch(e){try{console.error(`[cdr] ensure ChatGPT client failed`,e)}catch{}return null}" +
  "}}catch{}" +
  `/* ${MARKER}:ensure-client */` +
  "}));"; // } closes IIFE that originally closed after L=...; )); closes e((()=>{...})())

console.log("ending chars", [...toFixed.slice(-12)].map((c) => `${c}:${c.charCodeAt(0)}`));

let apply = fs.readFileSync(applyPath, "utf8");
const fromAnchor = '"L=f(p,()=>new fa)}));"';
const litStart = apply.indexOf('"L=f(p,()=>{let c=new fa');
if (litStart < 0) {
  // maybe already broken differently — find replaceOnce block
  throw new Error("could not find to-literal start");
}
const litEnd = apply.indexOf('",\n    "ensure ChatGPT client factory"', litStart);
if (litEnd < 0) throw new Error("could not find to-literal end");
apply = apply.slice(0, litStart) + JSON.stringify(toFixed) + apply.slice(litEnd + 1);
fs.writeFileSync(applyPath, apply);
console.log("apply script updated, ending", JSON.stringify(toFixed.slice(-25)));

// Dry-run patch
let chat = fs.readFileSync(CHAT, "utf8");
const from = "L=f(p,()=>new fa)}));";
if (!chat.includes(from)) throw new Error("chat anchor missing");
chat = chat.replace(from, toFixed);
chat = chat.replace(
  "async models(){return CDRMergeChatModels(Hn(await this.request.getModelsResponse()))}/* codex-rebuild:chat-usage-v41:merge */",
  "async models(){try{globalThis.__cdrChatClient=this}catch{}/* " +
    MARKER +
    ":publish-models */return CDRMergeChatModels(Hn(await this.request.getModelsResponse()))}/* codex-rebuild:chat-usage-v41:merge */",
);

try {
  acorn.parse(chat, { ecmaVersion: "latest", sourceType: "module" });
  console.log("chat parse OK");
} catch (err) {
  console.error("chat parse FAIL", err.message);
  const m = /(\d+):(\d+)/.exec(err.message);
  if (m) {
    const col = Number(m[2]);
    console.error(JSON.stringify(chat.slice(col - 80, col + 80)));
  }
  process.exit(1);
}
