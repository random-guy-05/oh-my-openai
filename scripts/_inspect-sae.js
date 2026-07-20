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

// Find sae definition
for (const pat of ["function sae(", "sae=function", ",sae=", "sae=(", "function sae"]) {
  const i = page.indexOf(pat);
  console.log(pat, i);
  if (i >= 0) console.log(page.slice(i, i + 1200));
}

// Find startNewConversation / Ev
const ev = page.indexOf("startNewConversation:s");
console.log("\nstartNew context", page.slice(ev - 200, ev + 200));

// Search for navigate to chat or work conversation
for (const pat of ["`/chat", "`/?mode", "mode=chat", "conversationOrigin:null", "nextMode:`work`", "nextMode:`chat`"]) {
  let i = 0,
    c = 0;
  while (c < 5) {
    i = page.indexOf(pat, i);
    if (i < 0) break;
    console.log(pat, i, page.slice(Math.max(0, i - 80), i + 160).replace(/\n/g, " "));
    i += pat.length;
    c++;
  }
}

// Find sae call sites
let i = 0,
  c = 0;
while (c < 10) {
  i = page.indexOf("sae(", i);
  if (i < 0) break;
  console.log("\nsae call", c, page.slice(i, i + 200));
  i += 4;
  c++;
}
