#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");

const assets = path.join(__dirname, "../src/mac-x64/_asar/webview/assets");
const local = fs.readFileSync(
  path.join(assets, "local-conversation-thread-Bnxyo76e.js"),
  "utf8",
);
const turns = fs.readFileSync(
  path.join(
    assets,
    "app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~bzu8y8ld-CrC1XERG.js",
  ),
  "utf8",
);

// Confirm bad filter
const bad = "filter(e=>!e||!e.cdrSource)";
const good = "filter(e=>e&&!e.cdrSource)";
console.log("bad filter in local?", local.includes(bad));
console.log("good filter in local?", local.includes(good));

// Find all ({turn destructures
for (const [label, src] of [
  ["local", local],
  ["turns", turns],
]) {
  let i = 0,
    n = 0;
  console.log("\n==", label, "({turn destructure");
  while ((i = src.indexOf("({turn", i)) >= 0 && n < 20) {
    console.log(i, JSON.stringify(src.slice(i - 50, i + 70)));
    i += 5;
    n++;
  }
  i = 0;
  n = 0;
  console.log("==", label, "{turn:");
  while ((i = src.indexOf("{turn:", i)) >= 0 && n < 25) {
    const snip = src.slice(Math.max(0, i - 60), i + 80);
    if (/map\(|for\s*\(|\.map\(/.test(snip) || snip.includes("let{turn") || snip.includes(",{turn")) {
      console.log(i, JSON.stringify(snip.replace(/\s+/g, " ")));
      n++;
    }
    i += 5;
  }
}

// Show full extras-tick IIFE
const tick = local.indexOf("sticky-chat-v46:extras-tick");
const end = local.indexOf("})(),V=B.at(-1)", tick);
console.log("\nFULL IIFE:\n", local.slice(local.lastIndexOf("(()=>{", tick), end + 4));

// turns merge mapped block
const tm = turns.indexOf("sticky-chat-v46:turns-merge");
console.log("\nTURNS MERGE:\n", turns.slice(tm - 500, tm + 80));
