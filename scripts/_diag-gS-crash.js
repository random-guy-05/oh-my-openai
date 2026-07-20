#!/usr/bin/env node
"use strict";
const fs = require("fs");
const send = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~oxnpxkxc-D1ceIDrn.js",
  "utf8",
);
const bzu = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~bzu8y8ld-CrC1XERG.js",
  "utf8",
);
const local = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/local-conversation-thread-Bnxyo76e.js",
  "utf8",
);

// Real userMessage item shape
let idx = 0,
  n = 0;
while ((idx = send.indexOf("userMessage", idx)) >= 0 && n < 8) {
  console.log(send.slice(idx - 60, idx + 120).replace(/\n/g, " "));
  idx += 10;
  n++;
}

// al import in local
const ali = local.indexOf(" as al,") >= 0 ? local.indexOf(" as al,") : local.indexOf(" as al}");
console.log("\nas al", local.slice(ali - 40, ali + 40));
let j = ali;
while (j < local.length && !local.startsWith("from", j)) j++;
console.log(local.slice(j, j + 100));

// After extras merge triggers re-render, gS uses al - does al === ll?
// Check if al is also no/to derived

// Safer approach: patch gS to null-check r.turn
console.log("\ngS", local.slice(local.indexOf("function gS("), local.indexOf("function gS(") + 220));

// Also check De/CC when renderEntries has our extras - tl function
const tl = local.indexOf("function tl(") >= 0 ? local.indexOf("function tl(") : local.indexOf("tl=e=>");
console.log("tl", tl, local.slice(Math.max(0,tl), tl > 0 ? tl + 150 : 0));

// Search type===`gap`
console.log("gap", local.indexOf("type:`gap`"), bzu.indexOf("type:`gap`"));
