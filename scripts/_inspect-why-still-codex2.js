#!/usr/bin/env node
"use strict";
const fs = require("fs");
const mod = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~notebook-preview-panel~app-main~pull-request-route~projects-index-page~cloud-en~lpx9dmpy-DIXNZs6h.js",
  "utf8",
);
const page = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~appgen-settings-page~page~appgen-library-page~appgen-page~appgen-setti~ogh9jurw-Ccxu2qV_.js",
  "utf8",
);

// Find Et near sl - look backwards for const At, jt
const sl = mod.indexOf("function sl(e,{currentMode");
const before = mod.slice(Math.max(0, sl - 5000), sl);
console.log("before sl (last 1500):\n", before.slice(-1500));

// Search At= and jt= in module more carefully for product mode
for (const m of before.matchAll(/\b(At|jt|Et)=[^;]{0,80}/g)) {
  console.log("bind", m[0]);
}

// Find function Et in whole file
let i = 0,
  c = 0;
while (c < 10) {
  i = mod.indexOf("function Et", i);
  if (i < 0) break;
  console.log("function Et", i, mod.slice(i, i + 300));
  i += 10;
  c++;
}

// Export: what is yn/sae mapping - At jt from imports in mod?
const exp = mod.lastIndexOf("export{");
console.log("\nexports", mod.slice(exp, exp + 600));

// In page, find ChatHome
console.log("\n=== ChatHome ===");
i = 0;
c = 0;
while (c < 5) {
  i = page.indexOf("ChatHome", i);
  if (i < 0) break;
  console.log(page.slice(Math.max(0, i - 80), i + 200).replace(/\n/g, " "));
  i += 8;
  c++;
}

// Find ZY and yY - home layout for /
console.log("\n=== ZY home shell ===");
for (const name of ["function ZY", "function yY", "function mX", "ZY=", "yY="]) {
  const j = page.indexOf(name);
  console.log(name, j, j >= 0 ? page.slice(j, j + 400).replace(/\n/g, " ").slice(0, 400) : "");
}

// How does codex vs work home differ on /
for (const pat of [
  "STEPS_PROSE",
  "collaborationMode",
  "local-conversation",
  "chatgpt-conversation",
  "isCodex",
  "productMode",
]) {
  console.log(pat, "page", page.split(pat).length - 1);
}
