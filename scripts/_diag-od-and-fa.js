#!/usr/bin/env node
"use strict";
const fs = require("fs");
const send = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~oxnpxkxc-D1ceIDrn.js",
  "utf8",
);
const local = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/local-conversation-thread-Bnxyo76e.js",
  "utf8",
);
const bzu = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~bzu8y8ld-CrC1XERG.js",
  "utf8",
);

// All oD call sites
let idx = 0,
  n = 0;
while ((idx = send.indexOf("oD(", idx)) >= 0 && n < 15) {
  if (!send.slice(idx - 20, idx).includes("function ")) {
    console.log("\nOD", idx, send.slice(idx - 100, idx + 180).replace(/\n/g, " "));
    n++;
  }
  idx += 3;
}

// Item types in real turns - search in oxnpxkxc for how user messages are stored
for (const t of [
  "`userMessage`",
  "`agentMessage`",
  "`user-message`",
  "`assistant-message`",
  "type:`text`",
]) {
  console.log(t, "send", send.split(t).length - 1, "bzu", bzu.split(t).length - 1, "local", local.split(t).length - 1);
}

// Find ie( or fe( that processes turn items
const ie = bzu.indexOf("function ie(");
console.log("\nie", bzu.slice(ie, ie + 500));

// Find where .turn. is accessed without optional chaining in bzu Fa pipeline
const fa = bzu.indexOf("function Fa(");
console.log("\nFa full-ish", bzu.slice(fa, fa + 1500));
