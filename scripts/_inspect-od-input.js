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
const od = send.indexOf("async function oD(e,t,n){");
const des = send.indexOf("let{beforeSendRequest", od);
console.log(send.slice(des + 1900, des + 2800));

// How visibleTurnEntries is built in atom al
const local = fs.readFileSync(
  path.join(__dirname, "../src/mac-x64/_asar/webview/assets/local-conversation-thread-Bnxyo76e.js"),
  "utf8",
);
const v = local.indexOf("visibleTurnEntries");
console.log("\nfirst visibleTurnEntries", local.slice(v - 100, v + 200));
let idx = 0,
  n = 0;
while ((idx = local.indexOf("visibleTurnEntries", idx)) >= 0 && n < 8) {
  console.log(n, idx, local.slice(idx - 50, idx + 100).replace(/\n/g, " "));
  idx += 10;
  n++;
}

// settings current mode subscribe - confirm CDRMode already present for picker patch
const settings = fs.readFileSync(
  path.join(
    __dirname,
    "../src/mac-x64/_asar/webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~unq8yzli-BVneZysG.js",
  ),
  "utf8",
);
console.log(
  "\npicker-mode present",
  settings.includes("chat-usage-v41:picker-mode"),
  "CDRMode in mk",
  settings.includes("let[CDRMode,CDRSetMode]"),
);
