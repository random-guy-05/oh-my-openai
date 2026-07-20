#!/usr/bin/env node
"use strict";
const fs = require("fs");
const page = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~appgen-settings-page~page~appgen-library-page~appgen-page~appgen-setti~ogh9jurw-Ccxu2qV_.js",
  "utf8",
);

// After P=b?tpp:null, find what composer component gets conversationOrigin:P and models
const i = page.indexOf("P=b?`tpp`:null");
console.log(page.slice(i, i + 1500));

console.log("\n=== Yr atom / o_ setter ===");
for (const pat of ["function o_(", ",o_=", "Yr=", "get(Yr)", "set(Yr", "_r("]) {
  const j = page.indexOf(pat);
  console.log(pat, j, j >= 0 ? page.slice(j, j + 200).replace(/\n/g, " ") : "");
}

// Find where homeComposerMode is resolved via yr
const yr = page.indexOf("yr({");
console.log("\nyr call", page.slice(yr - 100, yr + 300));

// How work home picks models - search FF composer
const ff = page.indexOf("function FF(");
console.log("\nFF", page.slice(ff, ff + 800));
