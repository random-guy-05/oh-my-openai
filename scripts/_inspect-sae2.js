#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const assets = path.join(__dirname, "../src/mac-x64/_asar/webview/assets");
const PAGE = path.join(
  assets,
  "app-initial~app-main~appgen-settings-page~page~appgen-library-page~appgen-page~appgen-setti~ogh9jurw-Ccxu2qV_.js",
);
const page = fs.readFileSync(PAGE, "utf8");

// Find nextMode handler
let i = 0,
  c = 0;
while (c < 15) {
  i = page.indexOf("nextMode", i);
  if (i < 0) break;
  console.log("---", c, page.slice(Math.max(0, i - 100), i + 250).replace(/\n/g, " "));
  i += 8;
  c++;
}

// Find Ev definition - start new conversation
for (const pat of ["function Ev(", ",Ev=", "Ev=function", "Ev=e=>", "Ev=()"]) {
  const j = page.indexOf(pat);
  console.log("Ev", pat, j, j >= 0 ? page.slice(j, j + 500) : "");
}

// Export aliases for sae - maybe minified as different export then renamed via import
for (const m of page.matchAll(/(\w+) as sae/g)) {
  console.log("as sae", m[0], m.index);
}
for (const m of page.matchAll(/sae as (\w+)/g)) {
  console.log("sae as", m[0]);
}

// Search switchProductMode or similar
for (const pat of ["switchProductMode", "setProductMode", "productMode:", "startNewConversation"]) {
  console.log(pat, page.split(pat).length - 1);
}
