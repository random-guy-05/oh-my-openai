#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const assets = path.join(__dirname, "../src/mac-x64/_asar/webview/assets");
const files = fs.readdirSync(assets).filter((f) => f.endsWith(".js"));

const needles = [
  "catalog-v36-local",
  "catalog-v33",
  "CDRChatSticky",
  "chat-origin-v",
  "native-chat-mode-v",
  "local-canonical-v36",
  "local-canonical-model-picker",
  "chat-models-v38",
  "chat-models-v39",
  "CDRMergeChatModels",
  "selectedLabel:`5.5 Instant`",
  "selectedLabel:`Sol High`",
  "cdr-product-mode",
  "onModeSelect:e=>{",
  "conversationOrigin:CDRChatMode",
];

for (const needle of needles) {
  const hits = [];
  for (const f of files) {
    const s = fs.readFileSync(path.join(assets, f), "utf8");
    if (s.includes(needle)) hits.push(f);
  }
  console.log(needle, "→", hits.length ? hits.join(" | ") : "(none)");
}

// Find chatgpt model picker / pe ge
for (const f of files) {
  if (!f.includes("quick-chat") && !f.includes("chatgpt-conversation") && !f.includes("page")) continue;
  const s = fs.readFileSync(path.join(assets, f), "utf8");
  if (s.includes("chatgpt-models") || (s.includes("selectedLabel") && s.includes("thinkingEffort") && s.includes("cdr-product-mode"))) {
    console.log("\ncandidate", f, "len", s.length);
    for (const p of ["Ee=", "pe=", "ge=", "CDRChatSticky", "catalog-v", "conversationOrigin"]) {
      if (s.includes(p)) console.log(" ", p, s.indexOf(p));
    }
  }
}
