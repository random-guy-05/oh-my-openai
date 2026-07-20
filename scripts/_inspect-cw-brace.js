#!/usr/bin/env node
"use strict";
const fs = require("fs");
const s = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/local-conversation-thread-Bnxyo76e.js",
  "utf8",
);
const start = s.indexOf("function Cw({conversationId:e");
// Find "){let" or "){const" or "){var" after start within reasonable range
const slice = s.slice(start, start + 3000);
const m = slice.match(/\)\{let /);
console.log("match", m && m.index, m && slice.slice(m.index, m.index + 200));

// Also show broken block exact for strip
const brokenStart = s.indexOf("M=du(e),let[CDRExtrasTick");
const brokenEnd = s.indexOf("})()),V=B.at(-1)", brokenStart);
console.log("\nstrip from", brokenStart, "to", brokenEnd + "})())".length);
console.log("prefix", s.slice(brokenStart - 20, brokenStart + 30));
console.log("suffix", s.slice(brokenEnd, brokenEnd + 40));
