#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const assets = path.join(__dirname, "../src/mac-x64/_asar/webview/assets");

const files = {
  page: [...fs.readdirSync(assets)].find((f) => f.includes("ogh9jurw") && f.endsWith(".js")),
  settings: [...fs.readdirSync(assets)].find((f) => f.includes("unq8yzli") && f.endsWith(".js")),
  chat: [...fs.readdirSync(assets)].find((f) => f.includes("nmo0zeut") && f.endsWith(".js")),
  local: [...fs.readdirSync(assets)].find((f) => f.startsWith("local-conversation-thread") && f.endsWith(".js")),
  bridge: [...fs.readdirSync(assets)].find(
    (f) => f.includes("iaab4bzx") || f.includes("appgen-settings-page~pull-request"),
  ),
};

for (const [k, f] of Object.entries(files)) {
  console.log(k, f || "(missing)");
  if (!f) continue;
  const s = fs.readFileSync(path.join(assets, f), "utf8");
  for (const pat of [
    "cdr-bridge",
    "CDRWriteExtra",
    "conversationTurns",
    "chat-usage-v42",
    "CDROnLocal",
    "CDRChatPower",
    "startCompletionStream",
    "client.models",
    "QU(",
  ]) {
    if (s.includes(pat)) console.log(" ", pat, s.indexOf(pat));
  }
}

// Find QU / submit in settings-like bundles
for (const f of fs.readdirSync(assets)) {
  if (!f.endsWith(".js")) continue;
  const p = path.join(assets, f);
  const st = fs.statSync(p);
  if (st.size > 5_000_000 || st.size < 1000) continue;
  const s = fs.readFileSync(p, "utf8");
  if (s.includes("cdr-bridge-v36") || s.includes("async function QU(")) {
    console.log("\nQU/bridge file", f, "bridge", s.includes("cdr-bridge"), "QU", s.indexOf("async function QU("));
  }
  if (s.includes("conversationTurns") && s.includes("cdr-thread-extras")) {
    console.log("extras merge", f);
  }
}
