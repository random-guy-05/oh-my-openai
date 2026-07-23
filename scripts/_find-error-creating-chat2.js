#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const assets = path.join(__dirname, "../src/mac-x64/_asar/webview/assets");

const files = [
  "chatgpt-conversation-page-CqdgIGDW.js",
  "app-initial~avatarOverlayCompositionSurface~app-main~new-thread-panel-page~onboarding-page~~kgjrczv7-1dj9DXyF.js",
  "app-initial~artifact-tab-content.electron~app-main~appgen-settings-page~pull-request-route~~pdazrfmg-ClU5PSrI.js",
  "local-conversation-thread-Bnxyo76e.js",
  "app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~bzu8y8ld-CrC1XERG.js",
  "app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~oxnpxkxc-D1ceIDrn.js",
];

for (const f of files) {
  const p = path.join(assets, f);
  if (!fs.existsSync(p)) {
    console.log("missing", f);
    continue;
  }
  const s = fs.readFileSync(p, "utf8");
  for (const n of [
    "Error creating chat",
    "Failed to create chat",
    "creating chat",
    "defaultMessage:`Error",
    "reading 'turn'",
  ]) {
    let i = s.indexOf(n);
    if (i < 0) continue;
    console.log("\n===", f.slice(0, 55), n, "===");
    // show a few
    let c = 0;
    while (i >= 0 && c < 4) {
      console.log(i, JSON.stringify(s.slice(Math.max(0, i - 120), i + 180)));
      i = s.indexOf(n, i + n.length);
      c++;
    }
  }
}

// Show current sticky markers in local+turns
const local = fs.readFileSync(path.join(assets, "local-conversation-thread-Bnxyo76e.js"), "utf8");
const turns = fs.readFileSync(
  path.join(
    assets,
    "app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~bzu8y8ld-CrC1XERG.js",
  ),
  "utf8",
);
console.log("\nmarkers local", {
  v47: local.includes("sticky-chat-v47"),
  v46: local.includes("sticky-chat-v46"),
  badFilter: local.includes("filter(e=>!e||!e.cdrSource)"),
  turnsMerge: turns.includes("cdr-thread-extras"),
});
