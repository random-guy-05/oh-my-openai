#!/usr/bin/env node
"use strict";
const fs = require("fs");
const p =
  "src/mac-x64/_asar/webview/assets/local-conversation-thread-Bnxyo76e.js";
const s = fs.readFileSync(p, "utf8");
const needles = [
  "visibleTurnEntries:B",
  "renderEntries:z,visibleTurnEntries",
  "hasRenderableTurns:I",
  "hasUserMessage:L",
  "latestVisibleTurnId:R",
  "i(ll,",
  "visibleTurnEntries",
];
for (const n of needles) {
  let i = 0,
    c = 0;
  while ((i = s.indexOf(n, i)) >= 0 && c < 6) {
    console.log("---", JSON.stringify(n), "@", i);
    console.log(s.slice(Math.max(0, i - 100), i + 220));
    i += n.length;
    c++;
  }
  if (!c) console.log("MISS", n);
}

const markers = [
  "sticky-chat-v43",
  "chat-usage-v42",
  "CDRChatPowerSelections",
  "CDRStickyChatSend",
  "turns-merge",
  "publish-client",
];
const files = {
  page: "src/mac-x64/_asar/webview/assets/app-initial~app-main~appgen-settings-page~page~appgen-library-page~appgen-page~appgen-setti~ogh9jurw-Ccxu2qV_.js",
  settings:
    "src/mac-x64/_asar/webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~unq8yzli-BVneZysG.js",
  chat: "src/mac-x64/_asar/webview/assets/app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~nmo0zeut-Cn9CuVaZ.js",
  send: "src/mac-x64/_asar/webview/assets/app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~oxnpxkxc-D1ceIDrn.js",
  turns:
    "src/mac-x64/_asar/webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~bzu8y8ld-CrC1XERG.js",
  local: p,
};
console.log("\n=== partial apply state ===");
for (const [k, f] of Object.entries(files)) {
  const src = fs.readFileSync(f, "utf8");
  console.log(k, markers.filter((m) => src.includes(m)).join(", ") || "(none)");
}
