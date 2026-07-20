#!/usr/bin/env node
"use strict";
const fs = require("fs");
const f =
  "src/mac-x64/_asar/webview/assets/app-initial~avatarOverlayCompositionSurface~artifact-tab-content.electron~notebook-preview-~mlij0y86-BXNJDBeL.js";
const s = fs.readFileSync(f, "utf8");
const page = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~appgen-settings-page~page~appgen-library-page~appgen-page~appgen-setti~ogh9jurw-Ccxu2qV_.js",
  "utf8",
);

// Full yr/_r/Q context
const i = s.indexOf("function _r(e,t)");
console.log(s.slice(i, i + 1200));

console.log("\n=== exports from mlij ===");
console.log(s.slice(s.lastIndexOf("export{"), s.lastIndexOf("export{") + 500));

// In page: how homeComposerMode chat vs work picks models / origin
let j = 0,
  c = 0;
while (c < 15) {
  j = page.indexOf("homeComposerMode", j);
  if (j < 0) break;
  const sn = page.slice(j, j + 300);
  if (/===`chat`|===`work`|conversationOrigin|chatgpt-models|ModelPicker|tpp/.test(sn)) {
    console.log("\nHIT", j, sn.replace(/\n/g, " "));
  }
  j += 16;
  c++;
}

// Search a===`chat` near composer
j = 0;
c = 0;
while (c < 20) {
  j = page.indexOf("===`chat`", j);
  if (j < 0) break;
  console.log("\n===`chat`", j, page.slice(Math.max(0, j - 80), j + 160).replace(/\n/g, " "));
  j += 9;
  c++;
}
