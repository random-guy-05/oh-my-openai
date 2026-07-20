#!/usr/bin/env node
"use strict";
const fs = require("fs");
const p =
  "src/mac-x64/_asar/webview/assets/local-conversation-thread-Bnxyo76e.js";
const s = fs.readFileSync(p, "utf8");
const d = s.indexOf("codex-rebuild:sticky-chat-v43:extras-listen");
// walk back to function
let start = d;
for (let i = d; i > d - 50000 && i > 0; i--) {
  if (s.startsWith("function ", i) || s.startsWith("function*", i)) {
    // check it's not nested too deep wrongly - prefer closest function
    const slice = s.slice(i, i + 120);
    if (/^function [A-Za-z_$][\w$]*\(/.test(slice)) {
      start = i;
      break;
    }
  }
}
console.log("fn candidate", start, s.slice(start, start + 200));

// Find all function declarations before d within 30k
const matches = [];
for (let i = Math.max(0, d - 30000); i < d; i++) {
  if (s.startsWith("function ", i) && /function [A-Za-z_$][\w$]*\(/.test(s.slice(i, i + 80))) {
    matches.push({ i, t: s.slice(i, i + 100) });
  }
}
console.log("\nfunctions before:");
for (const m of matches.slice(-8)) console.log(m.i, m.t);

// Show after M=du(e) original would be
const brokenStart = s.indexOf("M=du(e),let[CDRExtrasTick");
console.log("\nbroken starts", brokenStart);
console.log(s.slice(brokenStart, brokenStart + 100));

// Find end of broken IIFE - `})()),V=B.at(-1)`
const end = s.indexOf("})()),V=B.at(-1)", brokenStart);
console.log("end", end);
console.log(s.slice(end, end + 80));
