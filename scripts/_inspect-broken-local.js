#!/usr/bin/env node
"use strict";
const fs = require("fs");
const p =
  "src/mac-x64/_asar/webview/assets/local-conversation-thread-Bnxyo76e.js";
const s = fs.readFileSync(p, "utf8");
const i = s.indexOf("sticky-chat-v43");
console.log("marker at", i);
console.log(s.slice(Math.max(0, i - 200), i + 900));

const j = s.indexOf("extras-tick");
console.log("\n=== extras-tick ===");
console.log(s.slice(Math.max(0, j - 300), j + 1200));

// Find function start containing the destructure
const d = s.indexOf("firstVisibleTurnStartedAtMs:N");
console.log("\n=== around destructure ===");
console.log(s.slice(Math.max(0, d - 250), d + 200));
