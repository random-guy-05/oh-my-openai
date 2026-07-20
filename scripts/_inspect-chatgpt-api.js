#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const chatPath = path.join(
  __dirname,
  "..",
  "src/mac-x64/_asar/webview/assets/app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~nmo0zeut-Cn9CuVaZ.js",
);
const chat = fs.readFileSync(chatPath, "utf8");

// Find completion-related exports/methods
const patterns = [
  /async\s+(\w+)\([^)]*\)\{[^}]{0,80}completion/gi,
  /startCompletion[A-Za-z]*/g,
  /\.complete\(/g,
  /conversation\.send/g,
  /createNewConversation/g,
  /addConversation/g,
  /\/conversation\//g,
];

for (const p of patterns) {
  const hits = [];
  let m;
  const re = new RegExp(p.source, p.flags);
  while ((m = re.exec(chat)) && hits.length < 8) {
    hits.push({ at: m.index, text: chat.slice(m.index, m.index + 180).replace(/\n/g, " ") });
  }
  if (hits.length) {
    console.log("\nPATTERN", p);
    for (const h of hits) console.log(h.at, h.text);
  }
}

// Look for client class methods around models()
const models = chat.indexOf("async models(){return CDRMergeChatModels");
console.log("\nmodels at", models);
// Find enclosing class-ish methods nearby
const around = chat.slice(Math.max(0, models - 2000), models + 500);
const methods = [...around.matchAll(/async\s+(\w+)\(/g)].map((x) => x[1]);
console.log("nearby async methods", methods);

// Search for streaming completion entry
const streamIdx = chat.indexOf("stream");
console.log("first stream", streamIdx, chat.slice(streamIdx, streamIdx + 100));

// Search for chatgpt backend endpoints
for (const ep of [
  "conversation",
  "backend-api",
  "f/conversation",
  "sentinel",
  "completions",
]) {
  let idx = 0,
    n = 0;
  while ((idx = chat.indexOf(ep, idx)) >= 0 && n < 2) {
    if (n === 0) console.log(`\nEP ${ep}@${idx}`, chat.slice(idx - 40, idx + 120));
    idx += ep.length;
    n++;
  }
}
