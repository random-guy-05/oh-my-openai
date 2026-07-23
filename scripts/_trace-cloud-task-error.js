#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const assets = path.join(__dirname, "../src/mac-x64/_asar/webview/assets");
const f =
  "app-initial~avatarOverlayCompositionSurface~app-main~new-thread-panel-page~onboarding-page~~kgjrczv7-1dj9DXyF.js";
const s = fs.readFileSync(path.join(assets, f), "utf8");

const i = s.indexOf("composer.cloudTaskError.v2");
console.log("cloudTaskError context:\n", s.slice(i - 800, i + 400));

// Find who calls the formatter function - look for function name before it
// From earlier: `}function Io(e,` after the formatMessage - so function before is the toast helper
const fnStart = s.lastIndexOf("function ", i);
console.log("\nfn near:", s.slice(fnStart, fnStart + 80));

// Search .turn accesses in this file that are risky
const re = /\.map\(\(\{turn|\.filter\(\(\{turn|\.find\(\(\{turn|let\{turn:|const\{turn:|for\([^)]+\)\{let\{turn/g;
let m,
  n = 0;
while ((m = re.exec(s)) && n < 30) {
  console.log(m.index, JSON.stringify(s.slice(m.index - 30, m.index + 90)));
  n++;
}

// Also search startConversation / createLocal / createTask that might touch turns
for (const n2 of [
  "cloudTaskError",
  "startConversation",
  "createLocalTask",
  "createTask",
  "visibleTurnEntries",
  "conversationTurns",
]) {
  console.log(n2, (s.split(n2).length - 1));
}
