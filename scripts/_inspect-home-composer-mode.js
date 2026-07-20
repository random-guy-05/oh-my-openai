#!/usr/bin/env node
"use strict";
const fs = require("fs");
const page = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~appgen-settings-page~page~appgen-library-page~appgen-page~appgen-setti~ogh9jurw-Ccxu2qV_.js",
  "utf8",
);

let i = 0,
  c = 0;
console.log("=== homeComposerMode contexts ===");
while (c < 20) {
  i = page.indexOf("homeComposerMode", i);
  if (i < 0) break;
  console.log("\n---", c, "---");
  console.log(page.slice(Math.max(0, i - 120), i + 250).replace(/\n/g, " "));
  i += 16;
  c++;
}

console.log("\n=== HomeComposerModeToggle ===");
i = page.indexOf("HomeComposerModeToggle");
console.log(page.slice(i - 100, i + 500));

// Find atom/store for home composer mode
for (const pat of [
  "composerMode",
  "`chatgpt`",
  "`codex`",
  "setHomeComposer",
  "home-composer",
  "HomeComposer",
]) {
  console.log(pat, page.split(pat).length - 1);
}

// Find where submit from home creates local vs chatgpt
for (const pat of [
  "onSubmitAccepted",
  "startNewConversation",
  "navigateToLocal",
  "/local/",
  "work/conversation",
]) {
  let j = 0,
    d = 0;
  while (d < 4) {
    j = page.indexOf(pat, j);
    if (j < 0) break;
    if (j > 200000 && j < 450000) {
      // around home area
      console.log(pat, j, page.slice(j - 40, j + 160).replace(/\n/g, " "));
    }
    j += pat.length;
    d++;
  }
}
