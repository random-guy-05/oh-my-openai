#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const ASSETS = path.join(__dirname, "..", "src/mac-x64/_asar/webview/assets");

// Dump bg fallback fully
const jj = fs.readFileSync(
  path.join(ASSETS, fs.readdirSync(ASSETS).find((f) => f.includes("jj50pjos") && f.endsWith(".js"))),
  "utf8",
);
const i = jj.indexOf("function bg(e){");
console.log("==== bg ====");
console.log(jj.slice(i, i + 1200));

// Find fg and Ce - Update button
for (const name of ["function fg", "fg=", "Update ChatGPT", "checkForUpdates", "sparkle"]) {
  const j = jj.indexOf(name);
  console.log("\n", name, j);
  if (j >= 0) console.log(jj.slice(j, j + 400));
}

// Local extras mapping - current shape
const local = fs.readFileSync(path.join(ASSETS, "local-conversation-thread-Bnxyo76e.js"), "utf8");
const k = local.indexOf("sticky-chat-v52:extras-wrap");
console.log("\n==== extras map ====");
console.log(local.slice(k, k + 1200));

// Find agentMessage creation patterns in local or turns bundle
const turns = fs.readFileSync(
  path.join(ASSETS, fs.readdirSync(ASSETS).find((f) => f.includes("bzu8y8ld") && f.endsWith(".js"))),
  "utf8",
);
let idx = 0,
  n = 0;
console.log("\n==== agentMessage samples in turns ====");
while ((idx = turns.indexOf("type:`agentMessage`", idx)) >= 0 && n < 5) {
  console.log(turns.slice(Math.max(0, idx - 80), idx + 200));
  idx += 10;
  n++;
}

// userMessage samples
idx = 0;
n = 0;
console.log("\n==== userMessage samples in send/local ====");
const send = fs.readFileSync(
  path.join(ASSETS, fs.readdirSync(ASSETS).find((f) => f.includes("oxnpxkxc") && f.endsWith(".js"))),
  "utf8",
);
while ((idx = send.indexOf("type:`userMessage`", idx)) >= 0 && n < 4) {
  console.log(send.slice(Math.max(0, idx - 60), idx + 220));
  idx += 10;
  n++;
}
