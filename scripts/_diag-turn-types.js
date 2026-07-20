#!/usr/bin/env node
"use strict";
const fs = require("fs");
const local = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/local-conversation-thread-Bnxyo76e.js",
  "utf8",
);
const send = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~oxnpxkxc-D1ceIDrn.js",
  "utf8",
);

// gS definition
for (const p of ["function gS(", "gS=e=>", "gS=(e", ",gS=", "gS=f("]) {
  const i = local.indexOf(p);
  if (i >= 0) {
    console.log("gS via", p);
    console.log(local.slice(i, i + 400));
  }
}

// Find .turn access that isn't guarded - search " .turn" patterns that could throw
const bzu = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~bzu8y8ld-CrC1XERG.js",
  "utf8",
);

// Fa function processes conversationTurns into visibleTurnEntries
const fa = bzu.indexOf("function Fa(");
console.log("\nFa", bzu.slice(fa, fa + 800));

// How items types are expected - userMessage vs user-message
console.log("\nuserMessage count", (bzu.split("userMessage").length - 1));
console.log("user-message count", (bzu.split("`user-message`").length - 1));
console.log("agentMessage", (bzu.split("agentMessage").length - 1));
console.log("assistant-message", (bzu.split("`assistant-message`").length - 1));

// Sample real turn item types from codebase
for (const t of ["type:`userMessage`", "type:`agentMessage`", "type:`user-message`", 'type:"userMessage"']) {
  console.log(t, local.indexOf(t), bzu.indexOf(t), send.indexOf(t));
}

// oD early return - stream cleanup?
const hook = send.indexOf("if(await CDRStickyChatSend(e,t,n))return");
console.log("\n=== after early return callers expect ===");
console.log(send.slice(hook, hook + 100));

// What streamState methods clear streaming
for (const n of [
  "clearConversationStreaming",
  "markConversationIdle",
  "unmarkConversationStreaming",
  "setConversationStreaming",
  "streamingConversations",
]) {
  console.log(n, send.indexOf(n));
}
