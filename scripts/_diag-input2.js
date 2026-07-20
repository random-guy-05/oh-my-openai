#!/usr/bin/env node
"use strict";
const fs = require("fs");
const send = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~oxnpxkxc-D1ceIDrn.js",
  "utf8",
);
// Find where input items get serialized for turn/start
const i = send.indexOf("s.input");
console.log("first s.input", send.slice(i - 80, i + 300));

// Search for parseInput / serializeInput / inputItems
for (const n of [
  "function.*[Ii]nput",
  "items:s.input",
  "input:s.input",
  "text:e.text",
  "type:`text`",
]) {
  // 
}

let idx = 0,
  c = 0;
while ((idx = send.indexOf("type:`text`", idx)) >= 0 && c < 5) {
  console.log("\ntext type", idx, send.slice(idx - 60, idx + 100));
  idx += 10;
  c++;
}

// How composer builds input - in settings/unq8yzli
const settings = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~unq8yzli-BVneZysG.js",
  "utf8",
);
idx = 0;
c = 0;
while ((idx = settings.indexOf("input:", idx)) >= 0 && c < 15) {
  const slice = settings.slice(idx, idx + 80);
  if (slice.includes("text") || slice.includes("message") || slice.includes("trim")) {
    console.log("\nsettings input", idx, settings.slice(idx - 40, idx + 120));
    c++;
  }
  idx += 6;
}
