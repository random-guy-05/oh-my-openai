#!/usr/bin/env node
"use strict";
const fs = require("fs");
const page = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~appgen-settings-page~page~appgen-library-page~appgen-page~appgen-setti~ogh9jurw-Ccxu2qV_.js",
  "utf8",
);

// Find lA( and home composer mode atom around chatgpt/codex checks
const i = page.indexOf("i===`codex`&&c,v=i===`codex`");
console.log(page.slice(i - 500, i + 400));

console.log("\n=== search set home mode ===");
for (const pat of [
  "homeComposerMode",
  "set(pl",
  "Et(",
  "chatgpt`",
  "preserveHomeComposerMode",
]) {
  // skip
}

// Find YA() - used in lG as c=YA() - might be mode setter
const ya = page.indexOf("function YA");
console.log("YA", ya, page.slice(ya, ya + 400));

// Find where home mode atom is written
for (const pat of ["`chatgpt`", "home-composer-mode", "composer_mode", "HomeComposerMode"]) {
  let j = 0,
    c = 0;
  while (c < 8) {
    j = page.indexOf(pat, j);
    if (j < 0) break;
    const sn = page.slice(Math.max(0, j - 80), j + 120);
    if (/set\(|localStorage|atom|mode/.test(sn)) console.log(pat, j, sn.replace(/\n/g, " "));
    j += pat.length;
    c++;
  }
}
