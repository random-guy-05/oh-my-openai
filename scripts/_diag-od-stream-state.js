#!/usr/bin/env node
"use strict";
const fs = require("fs");
const send = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~oxnpxkxc-D1ceIDrn.js",
  "utf8",
);

const hook = send.indexOf("if(await CDRStickyChatSend(e,t,n))return");
console.log("hook", hook);
console.log(send.slice(hook - 200, hook + 300));

// What does oD do with streaming / turns before send?
const od = send.indexOf("async function oD(e,t,n){");
const body = send.slice(od, od + 5000);
for (const n of [
  "markConversationStreaming",
  "setConversationStreamRole",
  "broadcastConversationSnapshot",
  "streamState",
  "notifyConversation",
  "clientUserMessage",
]) {
  const i = body.indexOf(n);
  console.log(n, i);
}

// Find callers that mark streaming BEFORE oD
const call = send.indexOf("markConversationStreaming");
console.log("\nmarkStreaming contexts:");
let idx = 0,
  c = 0;
while ((idx = send.indexOf("markConversationStreaming", idx)) >= 0 && c < 5) {
  console.log(send.slice(idx - 80, idx + 200).replace(/\n/g, " "));
  idx += 10;
  c++;
}

// After oD returns in N=async
const N = send.indexOf("await oD(this,O,{clientUserMessageId");
console.log("\ncaller", send.slice(N - 400, N + 350));
