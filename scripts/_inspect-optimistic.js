#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const send = fs.readFileSync(
  path.join(
    __dirname,
    "../src/mac-x64/_asar/webview/assets/app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~oxnpxkxc-D1ceIDrn.js",
  ),
  "utf8",
);

for (const n of [
  "optimistic",
  "pendingUser",
  "clientUserMessage",
  "addLocalTurn",
  "appendTurn",
  "upsertTurn",
  "localMessage",
]) {
  const i = send.indexOf(n);
  console.log(n, i, i >= 0 ? send.slice(i - 40, i + 120).replace(/\n/g, " ") : "");
}

// Find where user message appears in UI before server ack - clientUserMessageId
const c = send.indexOf("clientUserMessageId");
console.log("\nclientUserMessageId", send.slice(c - 50, c + 300));

// In local thread, shape of a turn entry near vr( function
const local = fs.readFileSync(
  path.join(__dirname, "../src/mac-x64/_asar/webview/assets/local-conversation-thread-Bnxyo76e.js"),
  "utf8",
);
const vr = local.indexOf("function vr(");
console.log("\nvr", local.slice(vr, vr + 500));
