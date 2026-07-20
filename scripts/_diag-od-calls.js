#!/usr/bin/env node
"use strict";
const fs = require("fs");
const send = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~oxnpxkxc-D1ceIDrn.js",
  "utf8",
);

const i = 436845;
console.log(send.slice(i - 800, i + 600));

// Find all oD calls with more context
let idx = 0,
  n = 0;
while ((idx = send.indexOf("await oD(", idx)) >= 0 && n < 10) {
  console.log("\n==== await oD @", idx, "====");
  console.log(send.slice(idx, idx + 500));
  idx += 8;
  n++;
}

// Also search input: near collaboration send
const collab = send.indexOf("clientUserMessageId:o,cwd:ne");
console.log("\n==== build opts ====");
console.log(send.slice(collab - 1500, collab + 400));
