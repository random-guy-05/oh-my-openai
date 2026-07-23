#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const ASSETS = path.join(__dirname, "..", "src/mac-x64/_asar/webview/assets");
const local = fs.readFileSync(path.join(ASSETS, "local-conversation-thread-Bnxyo76e.js"), "utf8");

// SC call full args
const sc = local.indexOf("{entries:De,latestRenderedTurnKey:Oe}=SC(");
console.log("==== SC call ====");
console.log(local.slice(sc, sc + 900));

// Find function SC
const scDef = local.indexOf("function SC(");
console.log("\n==== SC def ====");
console.log(local.slice(scDef, scDef + 1200));

// Find where renderEntries are produced - search in turns for renderEntries:
const turns = fs.readFileSync(
  path.join(ASSETS, fs.readdirSync(ASSETS).find((f) => f.includes("bzu8y8ld") && f.endsWith(".js"))),
  "utf8",
);
let i = 0,
  n = 0;
console.log("\n==== renderEntries: in turns ====");
while ((i = turns.indexOf("renderEntries:", i)) >= 0 && n < 8) {
  console.log(turns.slice(Math.max(0, i - 150), i + 300));
  console.log("---");
  i += 14;
  n++;
}

// Find Fa function that returns both
const fa = turns.indexOf("function Fa(");
console.log("\n==== Fa ====");
console.log(turns.slice(fa, fa + 1500));
