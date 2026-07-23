#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const ASSETS = path.join(__dirname, "..", "src/mac-x64/_asar/webview/assets");
const local = fs.readFileSync(path.join(ASSETS, "local-conversation-thread-Bnxyo76e.js"), "utf8");

// Find ie( function - decides if turn is renderable
let ieIdx = -1;
for (const n of ["function ie(", "function ie=", "ie=e=>{", "ie=(e,"]) {
  // too broad
}
// Search for shouldHideUserMessage which is unique to ie call site's options
const sh = local.indexOf("shouldHideUserMessage");
console.log("shouldHideUserMessage contexts:");
let i = 0,
  n = 0;
while ((i = local.indexOf("shouldHideUserMessage", i)) >= 0 && n < 5) {
  console.log(local.slice(Math.max(0, i - 200), i + 400));
  console.log("---");
  i += 20;
  n++;
}

// Find turn.params access
console.log("\n==== .params. in local (turn-ish) ====");
i = 0;
n = 0;
while ((i = local.indexOf(".params.", i)) >= 0 && n < 25) {
  const ctx = local.slice(Math.max(0, i - 80), i + 80);
  if (/turn|entry|model|cwd|status/i.test(ctx)) {
    console.log(ctx);
    console.log("---");
    n++;
  }
  i += 8;
}

// Find Ef component / assistant message renderer issues
const turns = fs.readFileSync(
  path.join(ASSETS, fs.readdirSync(ASSETS).find((f) => f.includes("bzu8y8ld") && f.endsWith(".js"))),
  "utf8",
);
console.log("\n==== function ie in turns ====");
const ie = turns.indexOf("function ie(");
console.log(turns.slice(ie, ie + 800));

// status type checks
console.log("\n==== turn.status patterns in local ====");
i = 0;
n = 0;
while ((i = local.indexOf(".status", i)) >= 0 && n < 20) {
  const ctx = local.slice(Math.max(0, i - 40), i + 80);
  if (/turn\.status|e\.status|n\.status/.test(ctx)) {
    console.log(ctx);
    n++;
  }
  i += 7;
}

// ct( content helper for userMessage
console.log("\n==== function ct( ====");
const ct = local.indexOf("function ct(");
console.log(local.slice(ct, ct + 400));
