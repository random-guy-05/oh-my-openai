#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const assets = path.join(__dirname, "../src/mac-x64/_asar/webview/assets");
const turns = fs.readFileSync(
  path.join(
    assets,
    "app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~bzu8y8ld-CrC1XERG.js",
  ),
  "utf8",
);
const local = fs.readFileSync(
  path.join(assets, "local-conversation-thread-Bnxyo76e.js"),
  "utf8",
);
const send = fs.readFileSync(
  path.join(
    assets,
    "app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~oxnpxkxc-D1ceIDrn.js",
  ),
  "utf8",
);

// Native userMessage / agentMessage construction samples
for (const [label, src, needles] of [
  [
    "send",
    send,
    ["type:`userMessage`", "type:`agentMessage`", "userMessage", "content:[{type:`text`"],
  ],
  ["turns", turns, ["type:`userMessage`", "function ie(", "function Ge(", "function fe(", "function j("]],
]) {
  console.log("\n====", label);
  for (const n of needles) {
    let i = src.indexOf(n);
    console.log(n, i);
    if (i >= 0) console.log(JSON.stringify(src.slice(i, i + 350)));
  }
}

// Current extras merge bodies
console.log("\n==== current extras-tick");
const t = local.indexOf("extras-tick");
console.log(local.slice(t - 20, t + 1200));
console.log("\n==== current turns-merge");
const u = turns.indexOf("cdr-thread-extras");
console.log(turns.slice(u - 100, u + 700));
