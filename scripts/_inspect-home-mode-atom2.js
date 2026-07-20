#!/usr/bin/env node
"use strict";
const fs = require("fs");
const page = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~appgen-settings-page~page~appgen-library-page~appgen-page~appgen-setti~ogh9jurw-Ccxu2qV_.js",
  "utf8",
);

// Find where toggle value comes from and onValueChange
const i = page.indexOf("HomeComposerModeToggle");
// Find usage of SF or lazy toggle with value=
for (const pat of [
  "HomeComposerModeToggle",
  "homeComposerModeToggle",
  "onValueChange",
  "value:`chat`",
  "value:`work`",
  "===`chat`",
  "===`work`",
  "setHome",
  "composer.home",
]) {
  let j = 0,
    c = 0;
  while (c < 8) {
    j = page.indexOf(pat, j);
    if (j < 0) break;
    if (/chat|work|value|Mode|set\(/.test(page.slice(j, j + 200))) {
      console.log("\n", pat, j);
      console.log(page.slice(Math.max(0, j - 100), j + 220).replace(/\n/g, " "));
    }
    j += pat.length;
    c++;
  }
}

// Find Ev - startNewConversation - what mode it uses
console.log("\n=== Ev / startNewConversation ===");
// Ev is imported as r as Ev earlier - find definition via usage
const evUse = page.indexOf("s=Ev()");
console.log(page.slice(evUse - 50, evUse + 50));

// Search preserveHomeComposerMode in whole assets
const assets = fs.readdirSync("src/mac-x64/_asar/webview/assets").filter((f) => f.endsWith(".js"));
for (const f of assets) {
  const s = fs.readFileSync("src/mac-x64/_asar/webview/assets/" + f, "utf8");
  if (s.includes("preserveHomeComposerMode") || (s.includes("homeComposerMode") && s.includes("localStorage"))) {
    console.log("HIT", f);
    const k = s.indexOf("preserveHomeComposerMode");
    if (k >= 0) console.log(s.slice(k - 200, k + 400));
    const k2 = s.indexOf("homeComposerMode");
    if (k2 >= 0 && f.includes("home")) console.log(s.slice(0, 500));
  }
}
