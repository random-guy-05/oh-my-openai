"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const assets = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const TURNS = path.join(
  assets,
  "app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~bzu8y8ld-CrC1XERG.js",
);
const turns = fs.readFileSync(TURNS, "utf8");

// Full za helper context
const i = turns.indexOf("Berry display turn group must contain a turn");
console.log("za helper:\n", turns.slice(i - 450, i + 350));

// Full turns-merge with surrounding Fa call
const j = turns.indexOf("sticky-chat-v43:turns-merge");
console.log("\nturns-merge surrounding:\n", turns.slice(j - 250, j + 900));

// image map that still uses let{turn:t
const k = turns.indexOf("harden-turn-map");
console.log("\nimage map after harden:\n", turns.slice(k - 100, k + 450));
