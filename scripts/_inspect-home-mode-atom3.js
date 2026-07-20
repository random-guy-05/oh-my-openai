#!/usr/bin/env node
"use strict";
const fs = require("fs");
const page = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~appgen-settings-page~page~appgen-library-page~appgen-page~appgen-setti~ogh9jurw-Ccxu2qV_.js",
  "utf8",
);

// Find TI / home with toggle wiring
const ti = page.indexOf("function TI(");
console.log("TI", page.slice(ti, ti + 2000));

console.log("\n\n=== Dee HomeComposerMode suspense ===");
const dee = page.indexOf("debugName:`HomeComposerMode`");
console.log(page.slice(dee - 300, dee + 200));

// Search for atom key strings
for (const pat of [
  "home-composer-mode",
  "homeComposerMode",
  "composer-mode",
  "HOME_COMPOSER",
  "setHomeComposerMode",
  "useHomeComposerMode",
]) {
  const assets = fs.readdirSync("src/mac-x64/_asar/webview/assets");
  for (const f of assets) {
    if (!f.endsWith(".js")) continue;
    const s = fs.readFileSync("src/mac-x64/_asar/webview/assets/" + f, "utf8");
    if (!s.includes(pat)) continue;
    let i = 0,
      c = 0;
    while (c < 3) {
      i = s.indexOf(pat, i);
      if (i < 0) break;
      console.log(f.slice(0, 60), pat, i, s.slice(Math.max(0, i - 60), i + 140).replace(/\n/g, " ").slice(0, 220));
      i += pat.length;
      c++;
    }
  }
}
