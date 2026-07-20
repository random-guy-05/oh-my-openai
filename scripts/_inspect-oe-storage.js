#!/usr/bin/env node
"use strict";
const fs = require("fs");
const mlij = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~avatarOverlayCompositionSurface~artifact-tab-content.electron~notebook-preview-~mlij0y86-BXNJDBeL.js",
  "utf8",
);
// Find oe import: ie(),ae() in Sr init - from imports
const head = mlij.slice(0, 2500);
console.log(head);
console.log("\n--- oe usage ---");
const i = mlij.indexOf("br=`home-composer-mode-v1`");
console.log(mlij.slice(i - 200, i + 200));

// Find atomWithStorage-like oe in imported modules - search for oe=e=> or function that uses localStorage with key
for (const f of fs.readdirSync("src/mac-x64/_asar/webview/assets")) {
  if (!f.endsWith(".js") || f.length > 80) continue;
  const s = fs.readFileSync("src/mac-x64/_asar/webview/assets/" + f, "utf8");
  if (s.includes("localStorage") && s.includes("JSON.parse") && s.includes("atom") && s.length < 100000) {
    if (s.includes("function oe") || s.includes(",oe=") || s.includes("oe=(e")) {
      console.log("candidate", f, s.length);
    }
  }
}
