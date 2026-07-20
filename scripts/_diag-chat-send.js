#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");

const SEND = path.join(
  __dirname,
  "../src/mac-x64/_asar/webview/assets/app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~oxnpxkxc-D1ceIDrn.js",
);
const CHAT = path.join(
  __dirname,
  "../src/mac-x64/_asar/webview/assets/app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~nmo0zeut-Cn9CuVaZ.js",
);
const PAGE = path.join(
  __dirname,
  "../src/mac-x64/_asar/webview/assets/app-initial~app-main~appgen-settings-page~page~appgen-library-page~appgen-page~appgen-setti~ogh9jurw-Ccxu2qV_.js",
);

const send = fs.readFileSync(SEND, "utf8");
const chat = fs.readFileSync(CHAT, "utf8");
const page = fs.readFileSync(PAGE, "utf8");

console.log("markers", {
  stickyMode: page.includes("sticky-chat-v43:mode"),
  v42: page.includes("chat-usage-v42"),
  bridge: send.includes("CDRStickyChatSend"),
  bridgeHook: send.includes("sticky-chat-v43:bridge-hook"),
  publish: chat.includes("sticky-chat-v43:publish-client"),
});

const b = send.indexOf("async function CDRStickyChatSend");
console.log("\n=== BRIDGE FN ===");
console.log(send.slice(b, b + 3500));

const h = send.indexOf("sticky-chat-v43:bridge-hook");
console.log("\n=== HOOK ===");
console.log(send.slice(h - 120, h + 200));

// How is oD called — what does n contain?
let idx = 0,
  n = 0;
while ((idx = send.indexOf("oD(", idx)) >= 0 && n < 8) {
  const ctx = send.slice(Math.max(0, idx - 60), idx + 120);
  if (!ctx.includes("function oD") && !ctx.includes("CDRSticky")) {
    console.log("\ncall", idx, ctx);
    n++;
  }
  idx += 3;
}

// Find sendUserMessage / collaboration send that builds input
for (const needle of ["input:", "oD(e,", ".oD(", "sendRequest(`turn/start`"]) {
  // skip
}
const turnStart = send.indexOf("turn/start");
console.log("\nnear turn/start input build", send.slice(turnStart - 400, turnStart + 100));
