#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const p = path.join(
  __dirname,
  "../src/mac-x64/_asar/webview/assets/local-conversation-thread-Bnxyo76e.js",
);
const s = fs.readFileSync(p, "utf8");
const i = s.indexOf("sticky-chat-v46:extras-tick");
console.log(JSON.stringify(s.slice(i - 20, i + 900)));
const j = s.indexOf("sticky-chat-v46:gs-guard");
console.log("\n---gs---\n", JSON.stringify(s.slice(j - 30, j + 200)));
