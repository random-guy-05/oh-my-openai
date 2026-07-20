#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const assets = path.join(__dirname, "../src/mac-x64/_asar/webview/assets");

const markers = [
  "sticky-chat-v45",
  "sticky-chat-v43",
  "extras-tick",
  "CDRStickyChatSend",
  "__cdrEnsureChatClient",
];
for (const f of [
  "local-conversation-thread-Bnxyo76e.js",
  "app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~oxnpxkxc-D1ceIDrn.js",
  "app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~nmo0zeut-Cn9CuVaZ.js",
  "app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~bzu8y8ld-CrC1XERG.js",
]) {
  const s = fs.readFileSync(path.join(assets, f), "utf8");
  console.log(
    "\n",
    f.slice(0, 40),
    markers.filter((m) => s.includes(m)).join(", ") || "(none)",
  );
}

const local = fs.readFileSync(
  path.join(assets, "local-conversation-thread-Bnxyo76e.js"),
  "utf8",
);
const i = local.indexOf("sticky-chat-v43:extras-tick");
const j = local.indexOf("sticky-chat-v45:extras-tick");
console.log("\nextras-tick v43", i, "v45", j);
const tick = i >= 0 ? i : j;
if (tick >= 0) {
  console.log(local.slice(tick - 100, tick + 1200));
}

// Find .turn access near renderEntries / visibleTurnEntries after our merge
const send = fs.readFileSync(
  path.join(
    assets,
    "app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~oxnpxkxc-D1ceIDrn.js",
  ),
  "utf8",
);
console.log("\nbridge marker", send.includes("sticky-chat-v45:bridge-fn"));
const b = send.indexOf("CDRStickyChatSend");
console.log(send.slice(b, b + 400));
