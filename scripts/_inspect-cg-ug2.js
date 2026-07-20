#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const FILE = path.join(
  ROOT,
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~new-thread-panel-page~appgen-library-page~hotkey-window-thread-page~ho~jhj9i1pn-EyBx1hQI.js",
);
const s = fs.readFileSync(FILE, "utf8");
console.log("len", s.length);

// Find export { ... H, ... U ...}
const exp = s.lastIndexOf("export{");
console.log("export at", exp, s.slice(exp, exp + 1500));

// Find function H and U definitions - often `function H(` or `,H=e=>` or `H=function`
for (const name of ["H", "U", "G", "Ob", "Ab"]) {
  // look for function H( or H=function or ,H=(
  const pats = [
    `function ${name}(`,
    `,${name}=function`,
    `,${name}=(`,
    `\n${name}=function`,
    `${name}=e=>`,
    `${name}=(e,`,
    `${name}=(e)=>`,
  ];
  for (const p of pats) {
    let i = 0,
      c = 0;
    while (c < 3) {
      i = s.indexOf(p, i);
      if (i < 0) break;
      const snip = s.slice(i, i + 600);
      if (/model|reason|effort|display|sol|terra|power|ultra|flatten|filter/i.test(snip)) {
        console.log("\n===", p, "at", i, "===");
        console.log(snip.slice(0, 550));
      }
      i += p.length;
      c++;
    }
  }
}

// Search for curated allowlist strings
for (const pat of [
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "showUltra",
  "powerSelections",
  "supportedReasoningEfforts",
  "isDefault",
]) {
  let i = 0,
    c = 0;
  while (c < 5) {
    i = s.indexOf(pat, i);
    if (i < 0) break;
    console.log("\nPAT", pat, i, s.slice(Math.max(0, i - 100), i + 200).replace(/\n/g, " ").slice(0, 320));
    i += pat.length;
    c++;
  }
}
